import { useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import './PhoneNumberMatcher.css';

function PhoneNumberMatcher() {
  const [callDataFile, setCallDataFile] = useState(null);
  const [customerFile, setCustomerFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [stats, setStats] = useState(null);

  const handleFileUpload = (e, fileType) => {
    const file = e.target.files[0];
    if (fileType === 'calls') {
      setCallDataFile(file);
    } else {
      setCustomerFile(file);
    }
    setStats(null);
  };

  // Clean customer name - remove invalid names like "-"
  const cleanCustomerName = (name) => {
    if (!name) return 'Unknown';
    
    const trimmedName = String(name).trim();
    
    // Check if it's just a dash or empty
    if (trimmedName === '-' || trimmedName === '' || trimmedName === 'Unknown') {
      return 'Unknown';
    }
    
    return trimmedName;
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

  // Normalize phone number
  const normalizePhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return null;
    
    // Convert to string and remove any spaces or special characters
    const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, '');
    
    // Handle 11-digit numbers (remove leading 1)
    if (cleanNumber.length === 11 && cleanNumber[0] === '1') {
      return cleanNumber.substring(1);
    }
    
    // Return 10-digit numbers as is
    if (cleanNumber.length === 10) {
      return cleanNumber;
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
      
      // Step 1: Extract all phone numbers from call data with response 200
      const callsMap = new Map();
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

        // Normalize phone number
        const phoneNumber = normalizePhoneNumber(callDestination);

        // Check if response is 200 and we have a valid phone number
        if (phoneNumber && response === '200') {
          filteredCalls++;
          const durationInSeconds = parseDurationToSeconds(duration);

          // Aggregate durations for same numbers
          if (callsMap.has(phoneNumber)) {
            callsMap.set(
              phoneNumber,
              callsMap.get(phoneNumber) + durationInSeconds
            );
          } else {
            callsMap.set(phoneNumber, durationInSeconds);
          }
        }
      });

      setProgress('Processing customer data...');

      // Step 2: Extract UNIQUE phone numbers from customer file
      const uniqueCustomerMap = new Map(); // phoneNumber -> customer
      let skippedDashNames = 0;
      
      customerData.forEach((row) => {
        const phoneKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('phone')
        );
        const customerKey = Object.keys(row).find(key => 
          key.toLowerCase().includes('customer') || key.toLowerCase().includes('name')
        );

        const rawPhoneNumber = row[phoneKey];
        const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
        const rawCustomer = row[customerKey];
        const customer = cleanCustomerName(rawCustomer);

        if (phoneNumber) {
          // Skip if customer name is just "-"
          if (String(rawCustomer).trim() === '-') {
            skippedDashNames++;
            return; // Skip this entry
          }
          
          // Only add if not already in map (keeps first occurrence)
          if (!uniqueCustomerMap.has(phoneNumber)) {
            uniqueCustomerMap.set(phoneNumber, customer);
          }
        }
      });

      setProgress('Matching with customer data...');

      // Step 3: Match phone numbers with call data
      const finalData = [];
      let matchedCount = 0;

      uniqueCustomerMap.forEach((customer, phoneNumber) => {
        // Check if this phone number exists in our calls
        if (callsMap.has(phoneNumber)) {
          matchedCount++;
          const totalDuration = callsMap.get(phoneNumber);
          const durationMinutes = (totalDuration / 60);
          const rate = (durationMinutes * 0.035);

          finalData.push({
            customer: customer,
            phoneNumber: phoneNumber,
            durationSeconds: totalDuration,
            durationMinutes: parseFloat(durationMinutes.toFixed(2)),
            rate: parseFloat(rate.toFixed(2))
          });
        }
      });

      setProgress('Generating Excel file...');

      // Step 4: Create Excel workbook with 3 sheets
      const workbook = XLSX.utils.book_new();

      // Sheet 1: ALL UNIQUE Phone Numbers from Customer File (excluding "-" names)
      const sheet1Data = Array.from(uniqueCustomerMap.entries()).map(([phoneNumber, customer]) => ({
        'Customer': customer,
        'Phone Number': phoneNumber
      }));
      const sheet1 = XLSX.utils.json_to_sheet(sheet1Data);
      XLSX.utils.book_append_sheet(workbook, sheet1, 'All Phone Numbers');

      // Sheet 2: Total Duration (seconds), Customer, Phone Number (only matched)
      const sheet2Data = finalData.map(row => ({
        'Total Duration (Seconds)': row.durationSeconds,
        'Customer': row.customer,
        'Phone Number': row.phoneNumber
      }));
      const sheet2 = XLSX.utils.json_to_sheet(sheet2Data);
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Duration Summary');

      // Sheet 3: Customer, Duration (seconds), Duration (minutes), Rate - COMBINED BY CUSTOMER
      const customerAggregation = new Map();

      finalData.forEach(row => {
        const customerName = row.customer;
        
        if (customerAggregation.has(customerName)) {
          const existing = customerAggregation.get(customerName);
          customerAggregation.set(customerName, {
            customer: customerName,
            durationSeconds: existing.durationSeconds + row.durationSeconds,
            durationMinutes: existing.durationMinutes + row.durationMinutes,
            rate: existing.rate + row.rate
          });
        } else {
          customerAggregation.set(customerName, {
            customer: customerName,
            durationSeconds: row.durationSeconds,
            durationMinutes: row.durationMinutes,
            rate: row.rate
          });
        }
      });

      const sheet3Data = Array.from(customerAggregation.values()).map(row => ({
        'Customer': row.customer,
        'Duration (Seconds)': row.durationSeconds,
        'Duration (Minutes)': parseFloat(row.durationMinutes.toFixed(2)),
        'Rate ($)': parseFloat(row.rate.toFixed(2))
      }));

      const sheet3 = XLSX.utils.json_to_sheet(sheet3Data);
      XLSX.utils.book_append_sheet(workbook, sheet3, 'Billing Details');

      // Export the file
      const timestamp = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `Phone_Number_Analysis_${timestamp}.xlsx`);

      setStats({
        totalCalls,
        filteredCalls,
        uniqueNumbers: callsMap.size,
        matchedCustomers: matchedCount,
        totalRecords: finalData.length,
        uniqueCustomers: customerAggregation.size,
        totalPhoneNumbersInCustomerFile: uniqueCustomerMap.size,
        skippedDashNames: skippedDashNames
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
      <h1>📊 Phone Number Call Analyzer</h1>
      <p className="subtitle">Match call data with customer information</p>

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
              <span className="stat-label">Valid Calls (Response 200):</span>
              <span className="stat-value">{stats.filteredCalls}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Unique Phone Numbers in Calls:</span>
              <span className="stat-value">{stats.uniqueNumbers}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Unique Phone Numbers in Customer File:</span>
              <span className="stat-value">{stats.totalPhoneNumbersInCustomerFile}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Matched Customers (with calls):</span>
              <span className="stat-value">{stats.matchedCustomers}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Unique Customers in Billing:</span>
              <span className="stat-value">{stats.uniqueCustomers}</span>
            </div>
            {stats.skippedDashNames > 0 && (
              <div className="stat-item">
                <span className="stat-label">Skipped Records (Customer Name = "-"):</span>
                <span className="stat-value" style={{color: '#f59e0b'}}>{stats.skippedDashNames}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="info-section">
        <h3>ℹ️ How it works:</h3>
        <ol>
          <li>Extracts ALL phone numbers from both files</li>
          <li>Filters calls with Response code 200</li>
          <li>Aggregates total duration for duplicate numbers in call data</li>
          <li>Removes duplicate phone numbers from customer file (keeps first occurrence)</li>
          <li><strong>Skips records where customer name is just "-"</strong></li>
          <li>Matches unique customer phone numbers with call data</li>
          <li>Generates 3-sheet Excel report:
            <ul>
              <li><strong>Sheet 1:</strong> All UNIQUE Phone Numbers (excluding "-" names)</li>
              <li><strong>Sheet 2:</strong> Duration Summary (Only matched customers)</li>
              <li><strong>Sheet 3:</strong> Billing Details - Combined by Customer (Rate: $0.035/minute)</li>
            </ul>
          </li>
        </ol>
      </div>
    </div>
  );
}

export default PhoneNumberMatcher;