import { google } from 'googleapis';
// In App Router's route.ts, you import NextRequest and NextResponse
import { NextResponse } from 'next/server';

// Define types for the raw data from each sheet (array of objects)
interface SheetRow {
  [key: string]: string | number | undefined; // Using undefined for potentially missing values
}

// Define types for processed/calculated metrics
interface TimeToFillMetric {
  rmgId: string;
  department?: string;
  role?: string;
  createdDate: string;
  joiningDate?: string;
  daysToFill?: number; // Calculated field
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

// Main interface for the comprehensive MBR data output
interface MBRData {
  mcubeData: SheetRow[];
  taTrackerData: SheetRow[];
  offersTrackerData: SheetRow[];
  vendorConsolidatedData: SheetRow[];
  interviewListData: SheetRow[]; // Will be empty initially based on your input
  metrics: {
    timeToFillDetails: TimeToFillMetric[]; // Detailed Time to Fill for each joined candidate
    overallTimeToFillAverageDays?: number;
    offerAcceptanceRate?: number;
    offerStatusBreakdown: OfferMetric[];
    sourceOfHireBreakdown: SourceOfHireMetric[];
    joinersByDepartment: DepartmentJoinerMetric[];
    vendorSubmissionsByVendor: VendorSubmissionMetric[];
    // Add more aggregated metrics here as needed for other charts
  };
  error?: string; // Optional field for API errors
}

// Helper function to parse CSV-like 2D array data into an array of objects
function parseSheetData(rows: string[][]): SheetRow[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  const headers = rows[0].map(header => header.trim()); // Trim whitespace from headers
  return rows.slice(1).map(row => {
    const rowData: SheetRow = {};
    headers.forEach((header, index) => {
      // Clean and assign value. Convert to number if applicable.
      let value: string | number = row[index] ? row[index].trim() : '';
      if (!isNaN(Number(value)) && value !== '') {
        rowData[header] = Number(value);
      } else {
        rowData[header] = value;
      }
    });
    return rowData;
  });
}

// Helper function to calculate date difference in days
function getDaysDifference(startDateStr: string, endDateStr: string): number | undefined {
  // Month name to number mapping
  const monthMap: { [key: string]: number } = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };

  const parseDate = (dateString: string): Date | null => {
    // Try parsing as DD-Mon-YYYY (e.g., 27-Jan-2025)
    const partsDDMonYYYY = dateString.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
    if (partsDDMonYYYY) {
      const day = parseInt(partsDDMonYYYY[1], 10);
      const month = monthMap[partsDDMonYYYY[2]];
      const year = parseInt(partsDDMonYYYY[3], 10);
      if (month !== undefined) {
        return new Date(year, month, day);
      }
    }
    // Try parsing as MM/DD/YYYY
    const partsMDY = dateString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (partsMDY) {
      return new Date(`${partsMDY[3]}-${partsMDY[1]}-${partsMDY[2]}`);
    }
    // Try parsing as YYYY-MM-DD
    const partsYMD = dateString.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (partsYMD) {
      return new Date(`${partsYMD[1]}-${partsYMD[2]}-${partsYMD[3]}`);
    }
    // Fallback to direct parsing (may be locale-dependent or inconsistent)
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  };

  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  if (startDate && endDate) {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return undefined;
}

// For App Router API routes, export a function for the HTTP method
export async function GET() {
  try {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!clientEmail || !privateKey) {
      console.error('Missing Google Service Account credentials.');
      return NextResponse.json({ error: 'Server configuration error: Missing Google Service Account credentials.' }, { status: 500 });
    }
    if (!spreadsheetId) {
      console.error('Missing Google Sheets Spreadsheet ID.');
      return NextResponse.json({ error: 'Server configuration error: Missing Google Sheets Spreadsheet ID.' }, { status: 500 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Define the exact tab names as provided by the user
    const tabNames = {
      taTracker: 'TA Tracker',
      offersTracker: 'Offers tracker',
      mcubeData: 'Mcube Data',
      interviewList: 'Interview List',
      vendorConsolidated: 'Vendor Consolidated',
    };

    // --- Fetch Data from Each Tab ---
    const [
      taTrackerResponse,
      offersTrackerResponse,
      mcubeDataResponse,
      interviewListResponse,
      vendorConsolidatedResponse,
    ] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabNames.taTracker}!A:ZZ` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabNames.offersTracker}!A:ZZ` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabNames.mcubeData}!A:ZZ` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabNames.interviewList}!A:ZZ` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabNames.vendorConsolidated}!A:ZZ` }),
    ]);

    const taTrackerRows = taTrackerResponse.data.values as string[][];
    const offersTrackerRows = offersTrackerResponse.data.values as string[][];
    const mcubeDataRows = mcubeDataResponse.data.values as string[][];
    const interviewListRows = interviewListResponse.data.values as string[][];
    const vendorConsolidatedRows = vendorConsolidatedResponse.data.values as string[][];

    // --- Parse Raw Data into Structured Objects ---
    const taTrackerData = parseSheetData(taTrackerRows);
    const offersTrackerData = parseSheetData(offersTrackerRows);
    const mcubeData = parseSheetData(mcubeDataRows);
    const interviewListData = parseSheetData(interviewListRows);
    const vendorConsolidatedData = parseSheetData(vendorConsolidatedRows);

    // --- Calculate Metrics ---
    const metrics: MBRData['metrics'] = {
      timeToFillDetails: [],
      offerStatusBreakdown: [],
      sourceOfHireBreakdown: [],
      joinersByDepartment: [],
      vendorSubmissionsByVendor: [],
    };

    // 1. Time to Fill Calculation
    // Create a map of RMG ID to creation date from Mcube Data for quick lookup
    const mcubeRmgMap = new Map<string, string>();
    mcubeData.forEach(row => {
      const rmgId = row['RMG ID']?.toString();
      // CORRECTED: Use "Request Created Date" as per user's input
      const createdDate = row['Request Created Date']?.toString();
      if (rmgId && createdDate) {
        mcubeRmgMap.set(rmgId, createdDate);
      }
    });

    let totalDaysToFill = 0;
    let joinedCandidatesCount = 0;

    taTrackerData.forEach(row => {
      // Confirmed: "Joined" with capital 'J'
      if (row['Hiring Status'] === 'Joined') {
        const rmgId = row['RMG ID']?.toString();
        const joiningDate = row['Joining Date']?.toString(); // Confirmed: "Joining Date" is correct
        const department = row['Department']?.toString();
        const role = row['Role']?.toString();

        if (rmgId && joiningDate) {
          const createdDate = mcubeRmgMap.get(rmgId);
          if (createdDate) {
            const daysToFill = getDaysDifference(createdDate, joiningDate);
            if (daysToFill !== undefined) {
              metrics.timeToFillDetails.push({
                rmgId,
                department,
                role,
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


    // 2. Offer Status Breakdown and Acceptance Rate
    const offerStatusCounts = new Map<string, number>();
    let totalOffersMade = 0;
    let acceptedOffers = 0;

    offersTrackerData.forEach(row => {
      const status = row['Offer Status']?.toString();
      if (status) {
        offerStatusCounts.set(status, (offerStatusCounts.get(status) || 0) + 1);
        totalOffersMade++;
        if (status === 'Accepted') { // Adjust 'Accepted' to your actual "Accepted" status value
          acceptedOffers++;
        }
      }
    });
    metrics.offerStatusBreakdown = Array.from(offerStatusCounts.entries()).map(([status, count]) => ({
      offerStatus: status,
      count,
    }));
    metrics.offerAcceptanceRate = totalOffersMade > 0 ? (acceptedOffers / totalOffersMade) * 100 : undefined;


    // 3. Source of Hire Breakdown (from TA Tracker for Joined candidates)
    const sourceOfHireCounts = new Map<string, number>();
    taTrackerData.forEach(row => {
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


    // 4. Joiners by Department (from TA Tracker)
    const joinersByDepartmentCounts = new Map<string, number>();
    taTrackerData.forEach(row => {
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


    // 5. Vendor Submissions by Vendor Name
    const vendorSubmissionCounts = new Map<string, number>();
    vendorConsolidatedData.forEach(row => {
      const vendorName = row['Vendor Name']?.toString();
      if (vendorName) {
        vendorSubmissionCounts.set(vendorName, (vendorSubmissionCounts.get(vendorName) || 0) + 1);
      }
    });
    metrics.vendorSubmissionsByVendor = Array.from(vendorSubmissionCounts.entries()).map(([vendorName, count]) => ({
      vendorName,
      count,
    }));


    // --- Construct Final Response ---
    const mbrData: MBRData = {
      mcubeData,
      taTrackerData,
      offersTrackerData,
      vendorConsolidatedData,
      interviewListData,
      metrics,
    };

    // Use NextResponse.json for App Router API routes
    return NextResponse.json(mbrData, { status: 200 });

  } catch (error: any) {
    console.error('The API returned an error: ' + error.message || error);
    return NextResponse.json({ error: 'Failed to fetch and process data from Google Sheets' }, { status: 500 });
  }
}
