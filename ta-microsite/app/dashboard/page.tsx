'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';

// Define the interfaces to match the structure of your API response
// These should ideally be imported from a shared types file if your project grows
interface SheetRow {
  [key: string]: string | number | undefined;
}

interface TimeToFillMetric {
  rmgId: string;
  department?: string;
  role?: string;
  createdDate: string;
  joiningDate?: string;
  daysToFill?: number;
}

interface OfferMetric {
  offerStatus: string;
  count: number;
}

interface SourceOfHireMetric {
  source: string;
  count: number;
}

interface DepartmentJoinerMetric {
  department: string;
  count: number;
}

interface VendorSubmissionMetric {
  vendorName: string;
  count: number;
}

interface MBRData {
  mcubeData: SheetRow[];
  taTrackerData: SheetRow[];
  offersTrackerData: SheetRow[];
  vendorConsolidatedData: SheetRow[];
  interviewListData: SheetRow[];
  metrics: {
    timeToFillDetails: TimeToFillMetric[];
    overallTimeToFillAverageDays?: number;
    offerAcceptanceRate?: number;
    offerStatusBreakdown: OfferMetric[];
    sourceOfHireBreakdown: SourceOfHireMetric[];
    joinersByDepartment: DepartmentJoinerMetric[];
    vendorSubmissionsByVendor: VendorSubmissionMetric[];
  };
  error?: string;
}

// Define some consistent colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

export default function MBRDashboardPage() {
  const [mbrData, setMbrData] = useState<MBRData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State for AI summary
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMbrData = async () => {
      try {
        const response = await fetch('/api/get-ta-data');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: MBRData = await response.json();
        setMbrData(data);
      } catch (e: any) {
        console.error('Failed to fetch MBR data:', e);
        setError(e.message || 'An unknown error occurred while fetching data.');
      } finally {
        setLoading(false);
      }
    };

    fetchMbrData();
  }, []);

  // Function to generate AI summary
  const generateAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null); // Clear previous summary

    try {
      if (!mbrData) {
        setAiError("No MBR data available to generate a summary.");
        setAiLoading(false);
        return;
      }

      // --- NEW: Long and Detailed Prompt for AI ---
      let promptText = `
        You are an AI assistant specialized in Talent Acquisition (TA) operations.
        Your task is to analyze the provided raw data from various TA sheets and generate a comprehensive Monthly Business Review (MBR) executive summary.

        The data provided includes:
        - 'mcubeData': Contains requisition details including 'RMG ID' and 'Request Created Date'.
        - 'taTrackerData': Contains candidate journey details, including 'RMG ID', 'Hiring Status' (e.g., 'Joined'), 'Joining Date', 'Department', 'Role', 'Source'.
        - 'offersTrackerData': Contains offer status details with 'Offer Status' (e.g., 'Accepted', 'Declined') and 'Offer Decline Reason'.
        - 'vendorConsolidatedData': Contains details on profiles submitted by external vendors, including 'Vendor Name' and 'Profile Status'.
        - 'interviewListData': Currently empty, but will contain interview scheduling and feedback data when populated.

        Based on this data, please provide an executive summary (3-5 concise bullet points) that covers the following aspects:

        **1. Key Achievements and Positive Trends:**
        - Highlight strong performance indicators (e.g., high offer acceptance rate, significant number of joined candidates).
        - Point out any positive trends in 'Time to Fill' (from metrics or inferred from data).
        - Note effective 'Source' channels or 'Vendor' performance.

        **2. Significant Challenges and Negative Trends:**
        - Identify areas needing improvement (e.g., low offer acceptance rate, high decline reasons, long 'Time to Fill' for specific departments/roles).
        - Analyze 'Offer Decline Reason' in 'offersTrackerData' to pinpoint recurring issues.
        - Comment on any potential bottlenecks inferred from data (e.g., low conversion rates if you can deduce stages).

        **3. Data Insights and Potential Inconsistencies/Anomalies:**
        - **Recruitment Funnel Gaps:** Look for patterns indicating where candidates might be dropping off (e.g., many offers but few joins, many interviews but few offers - although detailed interview data is currently missing, analyze the available transitions).
        - **Time-to-Fill Anomalies:** Examine 'timeToFillDetails' in 'metrics'. If a 'Joining Date' in 'taTrackerData' is *before* a 'Request Created Date' in 'mcubeData' for the same 'RMG ID', flag this as a data inconsistency. Also, highlight unusually long or short 'daysToFill' values.
        - **Cross-Sheet Consistency:** Are there any 'RMG ID's or 'Candidate ID's (if applicable and present) that appear in one sheet but are missing or have conflicting status in another, suggesting data entry issues? (Focus primarily on RMG ID for Mcube/TA Tracker linkage).

        **4. Actionable Insights and Recommendations:**
        - Based on your analysis, suggest concrete areas for further investigation or immediate action for the TA team or leadership.
        - For example: "Investigate high decline rate in X department due to Y reason," or "Optimize sourcing from Z channel based on high joiner count."

        **Format your response as a clear, easy-to-read list of bullet points.**
      `;

      // --- Send ALL relevant data to the AI ---
      // Instead of just 'metrics', send the raw data from all relevant sheets.
      // The AI can then "read" these "sheets" (as JSON arrays)
      const dataToSend = {
        mcubeData: mbrData.mcubeData,
        taTrackerData: mbrData.taTrackerData,
        offersTrackerData: mbrData.offersTrackerData,
        vendorConsolidatedData: mbrData.vendorConsolidatedData,
        interviewListData: mbrData.interviewListData, // Including this even if empty, as context
        // Also send the pre-calculated metrics for quick reference
        metrics: {
          overallTimeToFillAverageDays: mbrData.metrics.overallTimeToFillAverageDays,
          offerAcceptanceRate: mbrData.metrics.offerAcceptanceRate,
          totalJoinedCandidates: mbrData.metrics.timeToFillDetails.length,
          offerStatusBreakdown: mbrData.metrics.offerStatusBreakdown,
          sourceOfHireBreakdown: mbrData.metrics.sourceOfHireBreakdown,
          joinersByDepartment: mbrData.metrics.joinersByDepartment,
          vendorSubmissionsByVendor: mbrData.metrics.vendorSubmissionsByVendor,
        }
      };

      const response = await fetch('/api/get-ai-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: promptText, data: dataToSend }),
      });

      if (!response.ok) {
        const errorDetail = await response.json();
        throw new Error(`HTTP error! status: ${response.status} - ${errorDetail.error || 'Unknown API Error'}`);
      }

      const result = await response.json();
      if (result.summary) {
        setAiSummary(result.summary);
      } else {
        throw new Error('AI summary not found in response or unexpected response structure.');
      }
    } catch (e: any) {
      console.error('Failed to generate AI summary:', e);
      setAiError(e.message || 'An unknown error occurred while generating AI summary.');
    } finally {
      setAiLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-xl text-gray-700">Loading MBR Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-800">
        <p className="text-xl">Error: {error}</p>
      </div>
    );
  }

  if (!mbrData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-yellow-100 text-yellow-800">
        <p className="text-xl">No data available.</p>
      </div>
    );
  }

  // Ensure data for charts is an array, even if empty
  const offerStatusData = mbrData.metrics.offerStatusBreakdown || [];
  const sourceOfHireData = mbrData.metrics.sourceOfHireBreakdown || [];
  const joinersByDepartmentData = mbrData.metrics.joinersByDepartment || [];
  const vendorSubmissionsData = mbrData.metrics.vendorSubmissionsByVendor || [];


  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-12">Monthly Business Review Dashboard</h1>

      {/* Executive Summary / Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
        <div className="bg-white p-6 rounded-lg shadow-lg text-center border border-blue-200">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Overall Time to Fill (Avg Days)</h2>
          <p className="text-5xl font-bold text-blue-600">
            {mbrData.metrics.overallTimeToFillAverageDays !== undefined
              ? mbrData.metrics.overallTimeToFillAverageDays.toFixed(1)
              : 'N/A'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-lg text-center border border-green-200">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Offer Acceptance Rate</h2>
          <p className="text-5xl font-bold text-green-600">
            {mbrData.metrics.offerAcceptanceRate !== undefined
              ? `${mbrData.metrics.offerAcceptanceRate.toFixed(1)}%`
              : 'N/A'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-lg text-center border border-purple-200">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Total Joined Candidates</h2>
          <p className="text-5xl font-bold text-purple-600">
            {mbrData.metrics.timeToFillDetails.length}
          </p>
        </div>
      </div>

      {/* AI Powered Executive Summary */}
      <div className="bg-white p-6 rounded-lg shadow-lg border border-orange-200 mb-12">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">AI Powered Executive Summary</h2>
        <div className="text-center mb-4">
          <button
            onClick={generateAiSummary}
            disabled={aiLoading}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-300 ease-in-out disabled:opacity-50"
          >
            {aiLoading ? 'Generating Summary...' : 'Generate AI Summary'}
          </button>
        </div>
        {aiError && (
          <div className="text-red-600 text-center mb-4">{aiError}</div>
        )}
        {aiSummary && (
          <div className="bg-gray-100 p-4 rounded-lg text-gray-700 whitespace-pre-wrap">
            {aiSummary}
          </div>
        )}
        {!aiLoading && !aiSummary && !aiError && (
            <div className="text-gray-500 text-center">Click "Generate AI Summary" to get insights based on current data.</div>
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {/* Offer Status Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Offer Status Breakdown</h2>
          {offerStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={offerStatusData}
                  dataKey="count"
                  nameKey="offerStatus"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={false}
                  label={({ percent }) => (percent !== undefined ? `${(percent * 100).toFixed(0)}%` : '')}
                >
                  {offerStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">No Offer Status Data</div>
          )}
        </div>

        {/* Source of Hire Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Source of Hire Breakdown (Joined)</h2>
          {sourceOfHireData.length > 0 ? (
            <ResponsiveContainer width="100%" height="80%">
              <BarChart
                data={sourceOfHireData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="source" angle={-45} textAnchor="end" height={80} interval={0} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">No Source of Hire Data</div>
          )}
        </div>

        {/* Joiners by Department */}
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Joiners by Department</h2>
          {joinersByDepartmentData.length > 0 ? (
            <ResponsiveContainer width="100%" height="80%">
              <BarChart
                data={joinersByDepartmentData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" angle={-45} textAnchor="end" height={80} interval={0} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#00C49F" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">No Joiners by Department Data</div>
          )}
        </div>

        {/* Vendor Submissions by Vendor */}
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Vendor Submissions by Vendor</h2>
          {vendorSubmissionsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="80%">
              <BarChart
                data={vendorSubmissionsData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="vendorName" angle={-45} textAnchor="end" height={80} interval={0} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#FFBB28" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">No Vendor Submissions Data</div>
          )}
        </div>

        {/* Placeholder for Time to Fill by Role Type / Trend Line */}
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Time to Fill by Role Type</h2>
          <div className="flex items-center justify-center h-full text-gray-500">
            Chart for Time to Fill by Role (Requires further aggregation in API if not already grouped)
          </div>
        </div>

        {/* Placeholder for Recruitment Funnel */}
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Recruitment Funnel Metrics</h2>
          <div className="flex items-center justify-center h-full text-gray-500">
            Funnel Chart Placeholder (Requires counts for Sourced, Screened, Interviewed, Offered, Joined)
          </div>
        </div>

      </div>
    </div>
  );
}
