'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, LineChart, Line
} from 'recharts';

// Define the interfaces to match the structure of your API response
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

interface ChartSuggestion {
  type: string;
  title: string;
  dataSourceKey: string;
  xAxisDataKey?: string;
  yAxisDataKey: string;
  description: string;
}

interface AiSummaryResponse {
  summary: string;
  chartSuggestions: ChartSuggestion[];
}

// Define some consistent colors for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658', '#d0ed57', '#a4de6c'];

// Define a maximum number of rows to send to the AI for each raw data sheet
const MAX_ROWS_FOR_AI_ANALYSIS = 100; // Keep this reasonable for AI context window

// Helper to parse DD-Mon-YYYY or YYYY-MM-DD dates for filtering
// MOVED THIS FUNCTION OUTSIDE THE COMPONENT
const parseDateForFiltering = (dateString: string | undefined): Date | null => {
  if (!dateString) return null;
  const monthMap: { [key: string]: number } = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };

  const partsDDMonYYYY = dateString.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (partsDDMonYYYY) {
    const day = parseInt(partsDDMonYYYY[1], 10);
    const month = monthMap[partsDDMonYYYY[2]];
    const year = parseInt(partsDDMonYYYY[3], 10);
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Try parsing as YYYY-MM-DD (from date input fields)
  const partsYMD = dateString.match(/^(\d{4})[-](\d{1,2})[-](\d{1,2})$/);
  if (partsYMD) {
    const year = parseInt(partsYMD[1], 10);
    const month = parseInt(partsYMD[2], 10) - 1; // Month is 0-indexed
    const day = parseInt(partsYMD[3], 10);
    return new Date(year, month, day);
  }

  // Fallback to direct parsing (may be locale-dependent or inconsistent)
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

// Helper function to calculate date difference in days (re-used from API route)
// MOVED THIS FUNCTION OUTSIDE THE COMPONENT
const getDaysDifference = (startDateStr: string, endDateStr: string): number | undefined => {
  const startDateObj = parseDateForFiltering(startDateStr);
  const endDateObj = parseDateForFiltering(endDateStr);

  if (startDateObj && endDateObj) {
    const diffTime = Math.abs(endDateObj.getTime() - startDateObj.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return undefined;
};


export default function MBRDashboardPage() {
  const [rawMbrData, setRawMbrData] = useState<MBRData | null>(null); // Store raw data
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiChartSuggestions, setAiChartSuggestions] = useState<ChartSuggestion[]>([]);

  // State for Date Filters
  const [startDate, setStartDate] = useState<string>('2024-05-01'); // Default to May 1st, 2024 for MBR context
  const [endDate, setEndDate] = useState<string>('2025-06-30');   // Default to June 30th, 2025

  useEffect(() => {
    const fetchMbrData = async () => {
      try {
        const response = await fetch('/api/get-ta-data');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: MBRData = await response.json();
        setRawMbrData(data);
      } catch (e: any) {
        console.error('Failed to fetch MBR data:', e);
        setError(e.message || 'An unknown error occurred while fetching data.');
      } finally {
        setLoading(false);
      }
    };

    fetchMbrData();
  }, []);

  // Memoized filtered data and metrics based on date range
  const filteredDataAndMetrics = useMemo(() => {
    if (!rawMbrData) {
      return null;
    }

    const start = startDate ? parseDateForFiltering(startDate) : null;
    const end = endDate ? parseDateForFiltering(endDate) : null;

    // Filter mcubeData by 'Request Created Date'
    const filteredMcubeData = rawMbrData.mcubeData.filter(row => {
      const date = parseDateForFiltering(row['Request Created Date']?.toString());
      return (!start || (date && date >= start)) && (!end || (date && date <= end));
    });

    // Filter taTrackerData by 'Joining Date' for joined candidates
    // For other statuses, we might filter by 'Status Change Date' if available, or 'Request Created Date' from Mcube
    const filteredTaTrackerData = rawMbrData.taTrackerData.filter(row => {
      const status = row['Hiring Status']?.toString();
      let relevantDate: Date | null = null;

      if (status === 'Joined') {
        relevantDate = parseDateForFiltering(row['Joining Date']?.toString());
      } else if (status === 'Declined' || status === 'Withdrawn') {
        // Assuming 'Offer Declined Date' or 'Last Status Change Date' exists for these statuses
        relevantDate = parseDateForFiltering(row['Offer Declined Date']?.toString() || row['Last Status Change Date']?.toString());
      } else {
        // For 'Open', 'Interviewing' etc., link back to Mcube's creation date for filtering
        const rmgId = row['RMG ID']?.toString();
        const mcubeReq = rawMbrData.mcubeData.find(mRow => mRow['RMG ID']?.toString() === rmgId);
        relevantDate = parseDateForFiltering(mcubeReq?.['Request Created Date']?.toString());
      }

      return (!start || (relevantDate && relevantDate >= start)) && (!end || (relevantDate && relevantDate <= end));
    });

    const filteredOffersTrackerData = rawMbrData.offersTrackerData.filter(row => {
      // Assuming offers have an 'Offer Date' or similar for filtering. Adjust if column name is different.
      const offerDate = parseDateForFiltering(row['Offer Date']?.toString());
      return (!start || (offerDate && offerDate >= start)) && (!end || (offerDate && offerDate <= end));
    });

    const filteredVendorConsolidatedData = rawMbrData.vendorConsolidatedData.filter(row => {
      // Assuming vendor submissions have a 'Submission Date' or similar. Adjust if column name is different.
      const submissionDate = parseDateForFiltering(row['Submission Date']?.toString());
      return (!start || (submissionDate && submissionDate >= start)) && (!end || (submissionDate && submissionDate <= end));
    });

    const filteredInterviewListData = rawMbrData.interviewListData.filter(row => {
      // Assuming interviews have an 'Interview Date' or similar. Adjust if column name is different.
      const interviewDate = parseDateForFiltering(row['Interview Date']?.toString());
      return (!start || (interviewDate && interviewDate >= start)) && (!end || (interviewDate && interviewDate <= end));
    });


    // --- Recalculate Metrics based on Filtered Data ---
    const metrics: MBRData['metrics'] = {
      timeToFillDetails: [],
      overallTimeToFillAverageDays: undefined,
      offerAcceptanceRate: undefined,
      offerStatusBreakdown: [],
      sourceOfHireBreakdown: [],
      joinersByDepartment: [],
      vendorSubmissionsByVendor: [],
    };

    // 1. Time to Fill Calculation (using filtered data)
    const mcubeRmgMap = new Map<string, string>();
    filteredMcubeData.forEach(row => {
      const rmgId = row['RMG ID']?.toString();
      const createdDate = row['Request Created Date']?.toString();
      if (rmgId && createdDate) {
        mcubeRmgMap.set(rmgId, createdDate);
      }
    });

    let totalDaysToFill = 0;
    let joinedCandidatesCount = 0;

    filteredTaTrackerData.forEach(row => {
      if (row['Hiring Status'] === 'Joined') {
        const rmgId = row['RMG ID']?.toString();
        const joiningDate = row['Joining Date']?.toString();

        if (rmgId && joiningDate) {
          const createdDate = mcubeRmgMap.get(rmgId);
          if (createdDate) {
            const daysToFill = getDaysDifference(createdDate, joiningDate);
            if (daysToFill !== undefined) {
              metrics.timeToFillDetails.push({
                rmgId,
                department: row['Department']?.toString(),
                role: row['Role']?.toString(),
                createdDate,
                joiningDate,
                daysToFill,
              });
              totalDaysToFill += daysToFill;
              joinedCandidatesCount++;
            }
          }
        }
      }
    });
    metrics.overallTimeToFillAverageDays = joinedCandidatesCount > 0 ? totalDaysToFill / joinedCandidatesCount : undefined;

    // 2. Offer Status Breakdown and Acceptance Rate (using filtered offers)
    const offerStatusCounts = new Map<string, number>();
    let totalOffersMade = 0;
    let acceptedOffers = 0;

    filteredOffersTrackerData.forEach(row => {
      const status = row['Offer Status']?.toString();
      if (status) {
        offerStatusCounts.set(status, (offerStatusCounts.get(status) || 0) + 1);
        totalOffersMade++;
        if (status === 'Accepted') {
          acceptedOffers++;
        }
      }
    });
    metrics.offerStatusBreakdown = Array.from(offerStatusCounts.entries()).map(([status, count]) => ({
      offerStatus: status,
      count,
    }));
    metrics.offerAcceptanceRate = totalOffersMade > 0 ? (acceptedOffers / totalOffersMade) * 100 : undefined;

    // 3. Source of Hire Breakdown (from filtered TA Tracker for Joined candidates)
    const sourceOfHireCounts = new Map<string, number>();
    filteredTaTrackerData.forEach(row => {
      if (row['Hiring Status'] === 'Joined') {
        const source = row['Source']?.toString();
        if (source) {
          sourceOfHireCounts.set(source, (sourceOfHireCounts.get(source) || 0) + 1);
        }
      }
    });
    metrics.sourceOfHireBreakdown = Array.from(sourceOfHireCounts.entries()).map(([source, count]) => ({
      source,
      count,
    }));

    // 4. Joiners by Department (from filtered TA Tracker)
    const joinersByDepartmentCounts = new Map<string, number>();
    filteredTaTrackerData.forEach(row => {
      if (row['Hiring Status'] === 'Joined') {
        const department = row['Department']?.toString();
        if (department) {
          joinersByDepartmentCounts.set(department, (joinersByDepartmentCounts.get(department) || 0) + 1);
        }
      }
    });
    metrics.joinersByDepartment = Array.from(joinersByDepartmentCounts.entries()).map(([department, count]) => ({
      department,
      count,
    }));

    // 5. Vendor Submissions by Vendor Name (from filtered Vendor Consolidated)
    const vendorSubmissionCounts = new Map<string, number>();
    filteredVendorConsolidatedData.forEach(row => {
      const vendorName = row['Vendor Name']?.toString();
      if (vendorName) {
        vendorSubmissionCounts.set(vendorName, (vendorSubmissionCounts.get(vendorName) || 0) + 1);
      }
    });
    metrics.vendorSubmissionsByVendor = Array.from(vendorSubmissionCounts.entries()).map(([vendorName, count]) => ({
      vendorName,
      count,
    }));

    // Return filtered raw data + re-calculated metrics
    return {
      mcubeData: filteredMcubeData,
      taTrackerData: filteredTaTrackerData,
      offersTrackerData: filteredOffersTrackerData,
      vendorConsolidatedData: filteredVendorConsolidatedData,
      interviewListData: filteredInterviewListData,
      metrics: metrics,
    } as MBRData; // Asserting the type
  }, [rawMbrData, startDate, endDate]);


  const generateAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    setAiChartSuggestions([]);

    try {
      if (!filteredDataAndMetrics) {
        setAiError("No MBR data available to generate a summary.");
        setAiLoading(false);
        return;
      }

      // --- Custom Prompt based on MBR Deck & TA Team Persona ---
      let promptText = `
        Alright team, let's dive into our latest Talent Acquisition (TA) performance review.
        I need you to act as a core member of our TA Operations team, providing a candid, data-driven executive summary (3-5 bullet points) and suggesting 2-3 key charts that would best represent our current status.

        We're focusing on the data within the following filtered ranges (if dates are applied, otherwise overall):
        - 'mcubeData' (Requisition Management): Look at 'RMG ID', 'Request Created Date', 'Status'.
        - 'taTrackerData' (Candidate Journey): Check 'RMG ID', 'Hiring Status' (especially 'Joined'), 'Joining Date', 'Department', 'Role', 'Source'.
        - 'offersTrackerData' (Offer Management): Analyze 'Offer Status' ('Accepted', 'Declined') and 'Offer Decline Reason'.
        - 'vendorConsolidatedData' (External Sourcing): Review 'Vendor Name', 'Profile Status'.
        - 'interviewListData': Will contain interview data when populated (currently empty, acknowledge this).

        Here's what I want you to highlight in our summary:

        **1. Our Wins & Key Progress:**
        - What are the standout achievements this period? (e.g., total joined candidates, strong offer acceptance rate, specific roles filled efficiently).
        - Any positive shifts in Time to Fill or conversion rates?

        **2. Challenges & Bottlenecks (and what we're seeing):**
        - Where are we facing headwinds? (e.g., high offer declines, specific reasons for decline, slow-moving requisitions in 'Mcube Data').
        - Are there any particular departments or roles that are proving challenging for Time to Fill?
        - Comment on the 'Interview List' currently being empty if that's still the case, as it's a gap in our funnel visibility.

        **3. Data Insights & Inconsistencies (our detective work):**
        - Based on 'Request Created Date' in 'Mcube Data' and 'Joining Date' in 'TA Tracker' for the same 'RMG ID', flag any instances where 'Joining Date' is earlier than 'Request Created Date' as a data anomaly or a data entry error.
        - Point out any unusually short or long 'daysToFill' values in the 'timeToFillDetails' metric.
        - Are there any noticeable disconnects in the candidate journey flow (e.g., high sourcing but low conversion to offer, or many offers but significant no-shows/declines not covered by clear reasons)?

        **4. Strategic Focus Areas:**
        - What should be our immediate focus areas for the TA team based on this data? (e.g., target specific decline reasons, optimize certain sourcing channels, focus on aging requisitions).

        **For Chart Suggestions:**
        - Suggest 2-3 *additional* charts that would provide critical insights for our MBR, beyond the existing ones.
        - For each, provide the 'type' (BarChart, PieChart, LineChart), a clear 'title', the 'dataSourceKey' (must be one of the *existing* metric arrays in the 'metrics' object, e.g., 'offerStatusBreakdown', 'sourceOfHireBreakdown', 'joinersByDepartment', 'timeToFillDetails', 'vendorSubmissionsByVendor'), 'xAxisDataKey' (for categories), 'yAxisDataKey' (for values), and a 'description'.
        - Do NOT suggest charts that require new calculations or data structures not already present in the 'metrics' object. Focus on combining/visualizing existing metrics in new ways.

        **Structure your response as a JSON object with 'summary' (string) and 'chartSuggestions' (array of objects) keys, as per the provided schema.**
      `;

      // --- Send Filtered Data to the AI ---
      const dataToSend = {
        mcubeData: filteredDataAndMetrics.mcubeData.slice(-MAX_ROWS_FOR_AI_ANALYSIS),
        taTrackerData: filteredDataAndMetrics.taTrackerData.slice(-MAX_ROWS_FOR_AI_ANALYSIS),
        offersTrackerData: filteredDataAndMetrics.offersTrackerData.slice(-MAX_ROWS_FOR_AI_ANALYSIS),
        vendorConsolidatedData: filteredDataAndMetrics.vendorConsolidatedData.slice(-MAX_ROWS_FOR_AI_ANALYSIS),
        interviewListData: filteredDataAndMetrics.interviewListData.slice(-MAX_ROWS_FOR_AI_ANALYSIS),
        // Always send the pre-calculated metrics (which are already based on filtered data) for quick reference
        metrics: {
          overallTimeToFillAverageDays: filteredDataAndMetrics.metrics.overallTimeToFillAverageDays,
          offerAcceptanceRate: filteredDataAndMetrics.metrics.offerAcceptanceRate,
          totalJoinedCandidates: filteredDataAndMetrics.metrics.timeToFillDetails.length,
          offerStatusBreakdown: filteredDataAndMetrics.metrics.offerStatusBreakdown,
          sourceOfHireBreakdown: filteredDataAndMetrics.metrics.sourceOfHireBreakdown,
          joinersByDepartment: filteredDataAndMetrics.metrics.joinersByDepartment,
          vendorSubmissionsByVendor: filteredDataAndMetrics.metrics.vendorSubmissionsByVendor,
          timeToFillDetails: filteredDataAndMetrics.metrics.timeToFillDetails.slice(-MAX_ROWS_FOR_AI_ANALYSIS), // Send some detailed TtF for anomaly detection
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
        throw new Error(`HTTP error! status: ${response.status} - ${errorDetail.error?.message || errorDetail.error || 'Unknown API Error'}`);
      }

      const result: AiSummaryResponse = await response.json();
      if (result.summary) {
        setAiSummary(result.summary);
        setAiChartSuggestions(result.chartSuggestions || []);
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
      <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
        <p className="text-xl text-gray-700">Loading MBR Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-800 font-inter">
        <p className="text-xl">Error: {error}</p>
      </div>
    );
  }

  if (!filteredDataAndMetrics) { // Use filteredDataAndMetrics here
    return (
      <div className="flex items-center justify-center min-h-screen bg-yellow-100 text-yellow-800 font-inter">
        <p className="text-xl">No data available after filtering. Adjust date range or check data source.</p>
      </div>
    );
  }

  // Assign filtered data to variables for easier use in JSX
  const mbrData = filteredDataAndMetrics;
  const offerStatusData = mbrData.metrics.offerStatusBreakdown || [];
  const sourceOfHireData = mbrData.metrics.sourceOfHireBreakdown || [];
  const joinersByDepartmentData = mbrData.metrics.joinersByDepartment || [];
  const vendorSubmissionsData = mbrData.metrics.vendorSubmissionsByVendor || [];


  // Data for "Monthly Joiners Trend Chart" - now based on filteredTaTrackerData
  const getMonthlyJoinersData = () => {
    const monthlyCountsMap = new Map<string, number>(); // Map<"YYYY-MM", count>

    mbrData.taTrackerData.forEach(row => { // Use filtered data here
      if (row['Hiring Status'] === 'Joined' && row['Joining Date']) {
        const joiningDateStr = row['Joining Date'].toString();
        const joiningDate = parseDateForFiltering(joiningDateStr); // Re-use universal parser
        if (joiningDate) {
            const monthKey = `${joiningDate.getFullYear()}-${(joiningDate.getMonth() + 1).toString().padStart(2, '0')}`;
            monthlyCountsMap.set(monthKey, (monthlyCountsMap.get(monthKey) || 0) + 1);
        }
      }
    });

    const sortedMonths = Array.from(monthlyCountsMap.keys()).sort();
    return sortedMonths.map(monthKey => ({
      month: monthKey,
      count: monthlyCountsMap.get(monthKey) || 0
    }));
  };
  const monthlyJoinersData = getMonthlyJoinersData();


  // Data for "Hiring Overview" - Total positions handled, open, filled, dropped, bench
  const calculateHiringOverview = () => {
    const totalPositionsHandled = mbrData.mcubeData.length; // Use filtered mcubeData
    const openPositions = mbrData.mcubeData.filter(req => req['Status'] === 'Open').length;
    const filledPositions = mbrData.taTrackerData.filter(candidate => candidate['Hiring Status'] === 'Joined').length;

    // Bench requirements: 'Request Created Date' is '19-Dec-2024'
    const benchPositions = mbrData.mcubeData.filter(req => {
        const createdDate = req['Request Created Date']?.toString();
        return createdDate === '19-Dec-2024'; // Exact match for the specified date
    }).length;

    // Assuming 'Cancelled' is a status in McubeData
    const cancelledPositions = mbrData.mcubeData.filter(req => req['Status'] === 'Cancelled').length;

    return { totalPositionsHandled, openPositions, filledPositions, cancelledPositions, benchPositions };
  };
  const hiringOverview = calculateHiringOverview();


  return (
    <div className="min-h-screen bg-gray-50 p-8 font-inter">
      <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-12">Monthly Business Review Dashboard</h1>

      {/* Date Filters Section */}
      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-8 flex flex-col md:flex-row items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-gray-800">Filter by Date:</h2>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          <span className="text-gray-600">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        {/* The useMemo hook handles re-calculation, no explicit "Apply" button needed unless API call is triggered */}
        <p className="text-sm text-gray-500 mt-2 md:mt-0">Data updates automatically with date selection.</p>
      </section>

      {/* Overview Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
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
        <div className="bg-white p-6 rounded-lg shadow-lg text-center border border-yellow-200">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Bench Positions (19-Dec-2024)</h2>
          <p className="text-5xl font-bold text-yellow-600">
            {hiringOverview.benchPositions}
          </p>
        </div>
      </section>

      {/* AI Powered Executive Summary */}
      <section className="bg-white p-6 rounded-lg shadow-lg border border-orange-200 mb-12">
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
      </section>

      {/* Hiring Overview Section */}
      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">3. Hiring Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 text-center">
          <div className="bg-blue-50 p-4 rounded-lg shadow-sm">
            <h3 className="text-xl font-medium text-blue-800">Total Positions Handled</h3>
            <p className="text-4xl font-bold text-blue-600">{hiringOverview.totalPositionsHandled}</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg shadow-sm">
            <h3 className="text-xl font-medium text-yellow-800">Open Positions</h3>
            <p className="text-4xl font-bold text-yellow-600">{hiringOverview.openPositions}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg shadow-sm">
            <h3 className="text-xl font-medium text-green-800">Filled Positions</h3>
            <p className="text-4xl font-bold text-green-600">{hiringOverview.filledPositions}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg shadow-sm">
            <h3 className="text-xl font-medium text-red-800">Cancelled Positions</h3>
            <p className="text-4xl font-bold text-red-600">{hiringOverview.cancelledPositions}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Monthly Joiners Trend */}
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Monthly Joiners Trend</h3>
            {monthlyJoinersData.length > 0 ? (
              <ResponsiveContainer width="100%" height="80%">
                <LineChart
                  data={monthlyJoinersData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#82ca9d" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">No Monthly Joiners Data for this period.</div>
            )}
          </div>

          {/* Joiners by Department */}
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Joiners by Department</h3>
            {joinersByDepartmentData.length > 0 ? (
              <ResponsiveContainer width="100%" height="80%">
                <BarChart
                  data={joinersByDepartmentData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="department"
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">No Joiners by Department Data for this period.</div>
            )}
          </div>
        </div>
      </section>

      {/* Offer vs. Joiner Ratio Section */}
      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">6. Offer vs. Joiner Ratio</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Offer Status Breakdown */}
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Offer Status Breakdown</h3>
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
              <div className="flex items-center justify-center h-full text-gray-500">No Offer Status Data for this period.</div>
            )}
          </div>
          {/* Placeholder for Offer vs Joiner Comparison Chart if needed */}
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Offer vs Joiner Comparison</h3>
            <div className="flex items-center justify-center h-full text-gray-500">
              Bar chart comparing Total Offers vs Total Joined (derived from metrics)
              {/* Example:
              <ResponsiveContainer width="100%" height="80%">
                <BarChart data={[{ name: 'Offers', value: mbrData.metrics.totalOffersMade }, { name: 'Joined', value: mbrData.metrics.totalJoinedCandidates }]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
              */}
            </div>
          </div>
        </div>
      </section>

      {/* Source Mix & Effectiveness Section */}
      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">7. Source Mix & Effectiveness</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Source of Hire Breakdown */}
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Source of Hire Breakdown (Joined)</h3>
            {sourceOfHireData.length > 0 ? (
              <ResponsiveContainer width="100%" height="80%">
                <BarChart
                  data={sourceOfHireData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="source"
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">No Source of Hire Data for this period.</div>
            )}
          </div>
          {/* Vendor Submissions by Vendor */}
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
            <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">Vendor Submissions by Vendor</h3>
            {vendorSubmissionsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="80%">
                <BarChart
                  data={vendorSubmissionsData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="vendorName"
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={80}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#FFBB28" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">No Vendor Submissions Data for this period.</div>
            )}
          </div>
        </div>
      </section>

      {/* Dynamic AI Suggested Charts Section */}
      {aiChartSuggestions.length > 0 && (
        <section className="bg-white p-6 rounded-lg shadow-lg border border-blue-200 mb-12">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">AI Suggested Charts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {aiChartSuggestions.map((suggestion, index) => {
              const chartData = mbrData.metrics[suggestion.dataSourceKey as keyof MBRData['metrics']] as any[];
              if (!chartData || chartData.length === 0) return null;

              const ChartComponent =
                suggestion.type === 'BarChart' ? BarChart :
                suggestion.type === 'PieChart' ? PieChart :
                suggestion.type === 'LineChart' ? LineChart :
                // suggestion.type === 'AreaChart' ? AreaChart : // Uncomment if AreaChart is needed and imported
                null;

              if (!ChartComponent) return null;

              return (
                <div key={index} className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 h-96">
                  <h3 className="text-2xl font-semibold text-gray-800 mb-4 text-center">{suggestion.title}</h3>
                  <p className="text-sm text-gray-600 mb-4 text-center">{suggestion.description}</p>
                  <ResponsiveContainer width="100%" height="70%">
                    {suggestion.type === 'PieChart' ? (
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey={suggestion.yAxisDataKey}
                          nameKey={suggestion.xAxisDataKey || 'name'}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          labelLine={false}
                          label={({ percent }) => (percent !== undefined ? `${(percent * 100).toFixed(0)}%` : '')}
                        >
                          {chartData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    ) : (
                      <ChartComponent
                        data={chartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey={suggestion.xAxisDataKey}
                          angle={-45}
                          textAnchor="end"
                          interval={0}
                          height={80}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis dataKey={suggestion.yAxisDataKey} />
                        <Tooltip />
                        <Legend />
                        {suggestion.type === 'BarChart' && <Bar dataKey={suggestion.yAxisDataKey} fill={COLORS[index % COLORS.length]} />}
                        {suggestion.type === 'LineChart' && <Line type="monotone" dataKey={suggestion.yAxisDataKey} stroke={COLORS[index % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} />}
                      </ChartComponent>
                    )}
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </section>
      )}


      {/* Placeholders for other Sections from MBR Deck - now with section titles */}
      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">4. Time-to-Hire & SLA Adherence</h2>
        <div className="text-gray-700 space-y-4">
          <p>This section will include charts for average time-to-fill per role type and SLA adherence percentage. Trend lines will show improvements or delays over time.</p>
          <div className="flex items-center justify-center h-48 bg-gray-100 rounded-md">Placeholder for Time-to-Hire & SLA Charts</div>
        </div>
      </section>

      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">5. Recruitment Funnel Metrics</h2>
        <div className="text-gray-700 space-y-4">
          <p>Visualize the funnel conversion rates: Sourced → Screened → Interviewed → Offered → Joined.</p>
          <div className="flex items-center justify-center h-48 bg-gray-100 rounded-md">Placeholder for Funnel Diagram</div>
        </div>
      </section>

      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">8. Critical Closures / Strategic Hires</h2>
        <div className="text-gray-700 space-y-4">
          <p>List of top roles filled (Leadership, niche skills) and brief on key profiles hired and business impact. This can be manually updated or pulled from a specific sheet.</p>
          <ul className="list-disc list-inside bg-gray-100 p-4 rounded-md">
            <li>Saurabh Kulkarni - Senior Vice President - G3 for Marketing (12-May-2025)</li>
            <li>Evonne Dsouza - Associate Vice President - G1 (12-May-2025)</li>
            {/* Add more as needed */}
          </ul>
        </div>
      </section>

      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">9. Challenges & Bottlenecks</h2>
        <div className="text-gray-700 space-y-4">
          <p>Identified internal and external challenges, along with actions taken or support needed.</p>
          <h3 className="text-xl font-semibold text-gray-800">SQL Hiring:</h3>
          <p className="ml-4">Challenge: Low interest in support roles and technical skill gaps. Solution: Targeted outreach, vendor engagement, lab shadowing.</p>
          <h3 className="text-xl font-semibold text-gray-800">Spotify Canada:</h3>
          <p className="ml-4">Challenge: Initial slowdown due to evolving role definitions. Solution: Regular sync-ups with internal stakeholders and vendors.</p>
          {/* Add more challenges as seen in the MBR deck */}
        </div>
      </section>

      <section className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-12">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">10. Recruitment Calendar & Initiatives</h2>
        <div className="text-gray-700 space-y-4">
          <p>Upcoming hiring drives, campus plans, diversity events, process improvements, and new tools introduced.</p>
          <h3 className="text-xl font-semibold text-gray-800">Key Initiatives:</h3>
          <ul className="list-disc list-inside bg-gray-100 p-4 rounded-md">
            <li>Prioritizing EDI Support, SQL Engineer, and DSP Platform Support roles.</li>
            <li>Launched job postings and mass mailing on Naukri for SQL/Snowflake.</li>
            <li>Conducted calibration sessions with Data Analytics and Delivery teams.</li>
            <li>Onboarded new job boards (Monster, Hireline) and vendors for overseas hiring.</li>
          </ul>
        </div>
      </section>

      {/* Sections 11-14 can be added as text blocks or data-driven depending on source data availability */}

    </div>
  );
}
