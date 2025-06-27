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
