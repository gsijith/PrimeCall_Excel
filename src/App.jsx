import { useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import './App.css';

function App() {
  const [callDataFile, setCallDataFile] = useState(null);
  const [customerFile, setCustomerFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [stats, setStats] = useState(null);

  const TOLL_FREE_PREFIXES = ['800', '811', '822', '833', '844', '855', '866', '877', '888', '899'];

  const handleFileUpload = (e, fileType) => {
    const file = e.target.files[0];
    if (fileType === 'calls') {
      setCallDataFile(file);
    } else {
      setCustomerFile(file);
    }
    setStats(null);
  };

  // Read file based on extension
  const readFile = async (file) => {
    return new Promise((resolve, reject) => {
      const fileExtension = file.name.split('.').pop().toLowerCase();

      if (fileExtension === 'csv') {
        // Parse CSV using PapaParse
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            resolve(results.data);
          },
          error: (error) => {
            reject(error);
          }
        });
      } else {
        // Parse Excel files (.xlsx, .xls)
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            resolve(jsonData);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsBinaryString(file);
      }
    });
  };

// Extract toll-free number from call destination
const extractTollFreeNumber = (callDestination) => {
  if (!callDestination) return null;
  
  // Convert to string and remove any spaces or special characters
  const cleanNumber = String(callDestination).replace(/[^0-9]/g, '');
  
  // Handle 10-digit numbers (don't remove first character)
  if (cleanNumber.length === 10) {
    // Get the first 3 digits (area code)
    const areaCode = cleanNumber.substring(0, 3);
    
    // Check if it's a toll-free prefix
    if (TOLL_FREE_PREFIXES.includes(areaCode)) {
      return cleanNumber; // Return the full 10-digit number
    }
  }
  
  // Handle 11-digit numbers (remove first digit, then check)
  if (cleanNumber.length === 11) {
    // Remove first digit
    const withoutFirstDigit = cleanNumber.substring(1);
    
    // Get the first 3 digits after removal (area code)
    const areaCode = withoutFirstDigit.substring(0, 3);
    
    // Check if it's a toll-free prefix
    if (TOLL_FREE_PREFIXES.includes(areaCode)) {
      return withoutFirstDigit; // Return the 10-digit number (without the leading digit)
    }
  }
  
  return null;
};

  // Parse duration to seconds
  const parseDurationToSeconds = (duration) => {
    if (!duration) return 0;
    
    // Handle if already a number
    if (typeof duration === 'number') return duration;
    
    const durationStr = String(duration).trim();
    
    // If it's already in seconds (just a number)
    if (/^\d+$/.test(durationStr)) {
      return parseInt(durationStr);
    }
    
    // Handle HH:MM:SS format
    if (durationStr.includes(':')) {
      const parts = durationStr.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        return (hours * 3600) + (minutes * 60) + seconds;
      } else if (parts.length === 2) {
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseInt(parts[1]) || 0;
        return (minutes * 60) + seconds;
      }
    }
    
    return 0;
  };

  const processFiles = async () => {
    if (!callDataFile || !customerFile) {
      alert('Please upload both files');
      return;
    }

    setProcessing(true);
    setProgress('Reading call data file...');

    try {
      // Read both files
      const callData = await readFile(callDataFile);
      setProgress('Reading customer file...');
      const customerData = await readFile(customerFile);

      setProgress('Processing call data...');
      
      // Step 1: Filter and extract toll-free numbers with response 200
      const tollFreeCallsMap = new Map();
      let totalCalls = 0;
      let filteredCalls = 0;

      callData.forEach((row) => {
        totalCalls++;
        
        // Find the correct field names (case-insensitive)
        const callDestKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('destination') || key.toLowerCase().includes('called')
        );
        const responseKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('response')
        );
        const durationKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('duration')
        );

        const callDestination = row[callDestKey];
        const response = String(row[responseKey]);
        const duration = row[durationKey];

        // Extract toll-free number
        const tollFreeNumber = extractTollFreeNumber(callDestination);

        // Check if response is 200 and we have a valid toll-free number
        if (tollFreeNumber && response === '200') {
          filteredCalls++;
          const durationInSeconds = parseDurationToSeconds(duration);

          // Aggregate durations for same numbers
          if (tollFreeCallsMap.has(tollFreeNumber)) {
            tollFreeCallsMap.set(
              tollFreeNumber,
              tollFreeCallsMap.get(tollFreeNumber) + durationInSeconds
            );
          } else {
            tollFreeCallsMap.set(tollFreeNumber, durationInSeconds);
          }
        }
      });

      setProgress('Matching with customer data...');

      // Step 2: Match with customer data
      const finalData = [];
      let matchedCount = 0;

      customerData.forEach((row) => {
        // Find phone number field (case-insensitive)
        const phoneKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('phone')
        );
        const customerKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('customer') || key.toLowerCase().includes('name')
        );

        let phoneNumber = String(row[phoneKey] || '').replace(/[^0-9]/g, '');
        const customer = row[customerKey];

        // Normalize phone number (remove leading 1 if present)
        if (phoneNumber.length === 11 && phoneNumber[0] === '1') {
          phoneNumber = phoneNumber.substring(1);
        }

        // Check if this phone number exists in our toll-free calls
        if (tollFreeCallsMap.has(phoneNumber)) {
          matchedCount++;
          const totalDuration = tollFreeCallsMap.get(phoneNumber);
          const durationMinutes = (totalDuration / 60).toFixed(2);
          const rate = (durationMinutes * 0.035).toFixed(2);

          finalData.push({
            customer: customer || 'Unknown',
            phoneNumber: phoneNumber,
            durationSeconds: totalDuration,
            durationMinutes: parseFloat(durationMinutes),
            rate: parseFloat(rate)
          });
        }
      });

      setProgress('Generating Excel file...');

      // Step 3: Create Excel workbook with 3 sheets
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Customer and Phone Number
      const sheet1Data = finalData.map(row => ({
        'Customer': row.customer,
        'Phone Number': row.phoneNumber
      }));
      const sheet1 = XLSX.utils.json_to_sheet(sheet1Data);
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Customer Info');

      // Sheet 2: Total Duration (seconds), Customer, Phone Number
      const sheet2Data = finalData.map(row => ({
        'Total Duration (Seconds)': row.durationSeconds,
        'Customer': row.customer,
        'Phone Number': row.phoneNumber
      }));
      const sheet2 = XLSX.utils.json_to_sheet(sheet2Data);
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Duration Summary');

      // Sheet 3: Customer, Duration (seconds), Duration (minutes), Rate
      const sheet3Data = finalData.map(row => ({
        'Customer': row.customer,
        'Duration (Seconds)': row.durationSeconds,
        'Duration (Minutes)': row.durationMinutes,
        'Rate ($)': row.rate
      }));
      const sheet3 = XLSX.utils.json_to_sheet(sheet3Data);
      XLSX.utils.book_append_sheet(workbook, sheet3, 'Billing Details');

      // Export the file
      const timestamp = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `Toll_Free_Analysis_${timestamp}.xlsx`);

      setStats({
        totalCalls,
        filteredCalls,
        uniqueNumbers: tollFreeCallsMap.size,
        matchedCustomers: matchedCount,
        totalRecords: finalData.length
      });

      setProgress('✓ Complete! File downloaded.');

    } catch (error) {
      console.error('Error processing files:', error);
      alert('Error processing files: ' + error.message);
      setProgress('Error occurred!');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="container">
      <h1>📊 Toll-Free Call Analyzer</h1>
      <p className="subtitle">Analyze call data and generate billing reports</p>

      <div className="upload-section">
        <div className="file-input-group">
          <label>
            <strong>📞 Call Data File</strong>
            <span className="file-info">(Duration, Response, Call Destination)</span>
          </label>
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv" 
            onChange={(e) => handleFileUpload(e, 'calls')}
            disabled={processing}
          />
          {callDataFile && <p className="file-selected">✓ {callDataFile.name}</p>}
        </div>

        <div className="file-input-group">
          <label>
            <strong>👥 Customer Data File</strong>
            <span className="file-info">(Customer, Phone Number)</span>
          </label>
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv" 
            onChange={(e) => handleFileUpload(e, 'customers')}
            disabled={processing}
          />
          {customerFile && <p className="file-selected">✓ {customerFile.name}</p>}
        </div>
      </div>

      <button 
        onClick={processFiles}
        disabled={processing || !callDataFile || !customerFile}
        className="process-button"
      >
        {processing ? '⏳ Processing...' : '🚀 Process and Generate Report'}
      </button>

      {progress && (
        <div className={`progress-message ${progress.includes('✓') ? 'success' : ''}`}>
          {progress}
        </div>
      )}

      {stats && (
        <div className="stats-section">
          <h3>📈 Processing Summary</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Calls Processed:</span>
              <span className="stat-value">{stats.totalCalls}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Valid Toll-Free Calls (Response 200):</span>
              <span className="stat-value">{stats.filteredCalls}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Unique Toll-Free Numbers:</span>
              <span className="stat-value">{stats.uniqueNumbers}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Matched Customers:</span>
              <span className="stat-value">{stats.matchedCustomers}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Records in Report:</span>
              <span className="stat-value">{stats.totalRecords}</span>
            </div>
          </div>
        </div>
      )}

      <div className="info-section">
        <h3>ℹ️ How it works:</h3>
        <ol>
          <li>Extracts toll-free numbers (800, 811, 822, 833, 844, 855, 866, 877, 888, 899)</li>
          <li>Filters calls with Response code 200</li>
          <li>Aggregates total duration for duplicate numbers</li>
          <li>Matches with customer database</li>
          <li>Generates 3-sheet Excel report:
            <ul>
              <li><strong>Sheet 1:</strong> Customer & Phone Number</li>
              <li><strong>Sheet 2:</strong> Duration Summary</li>
              <li><strong>Sheet 3:</strong> Billing Details (Rate: $0.035/minute)</li>
            </ul>
          </li>
        </ol>
      </div>
    </div>
  );
}

export default App;