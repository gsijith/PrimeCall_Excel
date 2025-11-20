import { useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import './ExcelAmount.css';

function ExcelAmount() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewData, setPreviewData] = useState(null);
  
  // New states for date range filtering
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
      ];
      
      const fileName = selectedFile.name.toLowerCase();
      const isValidExtension = fileName.endsWith('.xlsx') || 
                               fileName.endsWith('.xls') || 
                               fileName.endsWith('.csv');
      
      if (validTypes.includes(selectedFile.type) || isValidExtension) {
        setFile(selectedFile);
        setError('');
        setSuccess('');
        setPreviewData(null);
      } else {
        setError('Please upload a valid Excel file (.xlsx, .xls, .csv)');
        setFile(null);
      }
    }
  };

  // Parse call_time - handles both "10-03-2025 23:54" and "10/15/2025 16:54:54"
const parseCallTime = (callTimeStr) => {
  if (!callTimeStr) return null;
  
  try {
    const cleanStr = String(callTimeStr).trim().replace(/\s+/g, ' ');
    const parts = cleanStr.split(' ');
    
    const datePart = parts[0];
    const timePart = parts[1] || '00:00:00'; // Default time if not provided
    
    if (!datePart) return null;
    
    // Parse date: MM-DD-YYYY, MM/DD/YYYY, or MM/DD/YY
    let month, day, year;
    
    if (datePart.includes('/')) {
      const dateNums = datePart.split('/');
      month = parseInt(dateNums[0]);
      day = parseInt(dateNums[1]);
      year = parseInt(dateNums[2]);
    } else if (datePart.includes('-')) {
      const dateNums = datePart.split('-');
      month = parseInt(dateNums[0]);
      day = parseInt(dateNums[1]);
      year = parseInt(dateNums[2]);
    } else {
      return null;
    }
    
    if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
    
    // Handle 2-digit years: 25 -> 2025, 99 -> 2099, 00 -> 2000
    if (year < 100) {
      year = 2000 + year;
    }
    
    // Parse time: HH:MM:SS or HH:MM
    const timeParts = timePart.split(':');
    const hours = parseInt(timeParts[0]) || 0;
    const minutes = parseInt(timeParts[1]) || 0;
    const seconds = parseInt(timeParts[2]) || 0;
    
    // Create Date (month is 0-indexed)
    const date = new Date(year, month - 1, day, hours, minutes, seconds);
    
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.error('Error parsing call_time:', callTimeStr, error);
    return null;
  }
};

  // Check if date is within range
  const isDateInRange = (callTimeStr, startDateStr, endDateStr) => {
    const callDate = parseCallTime(callTimeStr);
    if (!callDate) return false;
    
    // Create start and end dates
    let startDateTime = null;
    let endDateTime = null;
    
    if (startDateStr) {
      startDateTime = new Date(startDateStr);
      startDateTime.setHours(0, 0, 0, 0);
    }
    
    if (endDateStr) {
      endDateTime = new Date(endDateStr);
      endDateTime.setHours(23, 59, 59, 999);
    }
    
    // Compare dates
    if (startDateTime && callDate < startDateTime) {
      return false;
    }
    
    if (endDateTime && callDate > endDateTime) {
      return false;
    }
    
    return true;
  };

  // Read and process Excel file
  const processExcelFile = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    // Validate date range if enabled
    if (useDateFilter) {
      if (!startDate && !endDate) {
        setError('Please select at least a start date or end date for filtering');
        return;
      }
      
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        setError('Start date cannot be after end date');
        return;
      }
    }

    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      const data = await readExcelFile(file);
      
      // Validate required columns
      if (!data || data.length === 0) {
        throw new Error('The Excel file is empty');
      }

      console.log('First row keys:', Object.keys(data[0]));
      console.log('First row sample:', data[0]);

      const requiredColumns = ['ani', 'duration', 'total_amount'];
      const columns = Object.keys(data[0]).map(col => col.toLowerCase().trim());
      
      const missingColumns = requiredColumns.filter(
        col => !columns.includes(col)
      );

      if (missingColumns.length > 0) {
        throw new Error(
          `Missing required columns: ${missingColumns.join(', ')}. Found columns: ${columns.join(', ')}`
        );
      }

      // Check for call_time column if date filter is enabled
      if (useDateFilter && !columns.includes('call_time')) {
        throw new Error('Date filter is enabled but "call_time" column is missing in the file');
      }

      // Process and group data with optional date filtering
      const processedData = groupAndCalculate(data, useDateFilter, startDate, endDate);
      
      if (processedData.length === 0) {
        throw new Error('No records found matching the specified criteria');
      }
      
      // Show preview
      setPreviewData(processedData.slice(0, 5));
      
      // Generate new Excel file
      generateExcelFile(processedData, useDateFilter, startDate, endDate);
      
      const dateRangeMsg = useDateFilter 
        ? ` within date range (${startDate || 'Start'} to ${endDate || 'End'})` 
        : '';
      
      setSuccess(`Successfully processed ${data.length} rows into ${processedData.length} grouped entries${dateRangeMsg}`);
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Processing error:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Read Excel file
  const readExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get first sheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            defval: ''
          });
          
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Failed to read Excel file: ' + error.message));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  };

  // Group by ANI and calculate totals with optional date filtering
  const groupAndCalculate = (data, filterByDate = false, start = null, end = null) => {
    const grouped = {};
    let totalRecords = 0;
    let matchedRecords = 0;
    let skippedRecords = 0;

    console.log('\n=== DATE FILTER DEBUG ===');
    console.log('Filter enabled:', filterByDate);
    console.log('Start date:', start);
    console.log('End date:', end);
    console.log('Total records in file:', data.length);

    data.forEach((row, index) => {
      totalRecords++;

      // Normalize column names (handle case variations)
      const normalizedRow = {};
      Object.keys(row).forEach(key => {
        normalizedRow[key.toLowerCase().trim()] = row[key];
      });

      // Debug first 3 records
      if (index < 3) {
        console.log(`\nRecord ${index + 1}:`);
        console.log('  call_time:', normalizedRow.call_time);
        console.log('  ani:', normalizedRow.ani);
        console.log('  duration:', normalizedRow.duration);
        console.log('  total_amount:', normalizedRow.total_amount);
      }

      // Apply date filter if enabled
      if (filterByDate) {
        const callTime = normalizedRow.call_time;
        
        if (!callTime) {
          skippedRecords++;
          return;
        }

        const parsedDate = parseCallTime(callTime);
        
        if (!parsedDate) {
          if (index < 5) {
            console.log(`  ❌ Failed to parse: "${callTime}"`);
          }
          skippedRecords++;
          return;
        }

        if (index < 3) {
          console.log('  Parsed date:', parsedDate.toISOString());
          console.log('  Is in range?', isDateInRange(callTime, start, end));
        }

        if (!isDateInRange(callTime, start, end)) {
          skippedRecords++;
          return;
        }
        
        matchedRecords++;
      }

      const ani = String(normalizedRow.ani || '').trim();
      const duration = parseFloat(normalizedRow.duration) || 0;
      const totalAmount = parseFloat(normalizedRow.total_amount) || 0;

      if (!ani) return; // Skip empty ANI values

      if (!grouped[ani]) {
        grouped[ani] = {
          ani: ani,
          duration: 0,
          total_amount: 0,
          count: 0
        };
      }

      grouped[ani].duration += duration;
      grouped[ani].total_amount += totalAmount;
      grouped[ani].count += 1;
    });

    console.log('\n=== RESULTS ===');
    console.log('Total records:', totalRecords);
    if (filterByDate) {
      console.log('Matched records:', matchedRecords);
      console.log('Skipped records:', skippedRecords);
    }
    console.log('Unique ANIs:', Object.keys(grouped).length);

    // Convert to array and calculate interest
    const result = Object.values(grouped).map(item => {
      const interestAmount = item.total_amount * 1.30; // 30% interest
      
      return {
        ANI: item.ani,
        'Total Duration': item.duration.toFixed(2),
        'Total Amount': item.total_amount.toFixed(2),
        'Amount with Interest (30%)': interestAmount.toFixed(2),
        'Number of Records': item.count
      };
    });

    // Sort by ANI
    return result.sort((a, b) => a.ANI.localeCompare(b.ANI));
  };

  // Generate and download Excel file
  const generateExcelFile = (processedData, filterByDate, start, end) => {
    try {
      // Create a new workbook
      const wb = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const ws = XLSX.utils.json_to_sheet(processedData);
      
      // Set column widths
      const columnWidths = [
        { wch: 15 }, // ANI
        { wch: 15 }, // Total Duration
        { wch: 15 }, // Total Amount
        { wch: 25 }, // Amount with Interest
        { wch: 18 }  // Number of Records
      ];
      ws['!cols'] = columnWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Processed Data');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(wb, { 
        bookType: 'xlsx', 
        type: 'array' 
      });
      
      // Save file
      const dataBlob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const dateRangeSuffix = filterByDate 
        ? `_${start || 'start'}_to_${end || 'end'}` 
        : '';
      
      saveAs(dataBlob, `processed_data${dateRangeSuffix}_${timestamp}.xlsx`);
    } catch (error) {
      throw new Error('Failed to generate Excel file: ' + error.message);
    }
  };

  return (
    <div className="app-container">
      <div className="card">
        <h1>Excel Data Processor</h1>
        <p className="subtitle">
          Upload Excel file with ANI, Duration, and Total Amount columns
        </p>

        <div className="upload-section">
          <label htmlFor="file-upload" className="file-label">
            <svg 
              className="upload-icon" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
              />
            </svg>
            <span>{file ? file.name : 'Choose Excel File'}</span>
            <input
              id="file-upload"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="file-input"
            />
          </label>

          {/* Date Range Filter Section */}
          <div className="date-filter-section">
            <div className="date-filter-toggle">
              <input
                type="checkbox"
                id="date-filter-checkbox"
                checked={useDateFilter}
                onChange={(e) => setUseDateFilter(e.target.checked)}
                className="checkbox-input"
              />
              <label htmlFor="date-filter-checkbox" className="checkbox-label">
                <svg 
                  className="calendar-icon" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
                  />
                </svg>
                Filter by Date Range
              </label>
            </div>

            {useDateFilter && (
              <div className="date-inputs">
                <div className="date-input-group">
                  <label htmlFor="start-date">Start Date</label>
                  <input
                    type="date"
                    id="start-date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="date-input"
                  />
                </div>

                <div className="date-input-group">
                  <label htmlFor="end-date">End Date</label>
                  <input
                    type="date"
                    id="end-date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="date-input"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={processExcelFile}
            disabled={!file || processing}
            className="process-button"
          >
            {processing ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              'Process File'
            )}
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            <svg className="alert-icon" fill="currentColor" viewBox="0 0 20 20">
              <path 
                fillRule="evenodd" 
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
              />
            </svg>
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <svg className="alert-icon" fill="currentColor" viewBox="0 0 20 20">
              <path 
                fillRule="evenodd" 
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" 
              />
            </svg>
            {success}
          </div>
        )}

        {previewData && previewData.length > 0 && (
          <div className="preview-section">
            <h3>Preview (First 5 rows)</h3>
            <div className="table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    {Object.keys(previewData[0]).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((value, i) => (
                        <td key={i}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="info-section">
          <h3>How it works:</h3>
          <ol>
            <li>Upload an Excel file (.xlsx, .xls, or .csv)</li>
            <li>File must contain columns: <strong>ani</strong>, <strong>duration</strong>, <strong>total_amount</strong></li>
            <li><strong>Optional:</strong> Enable date range filter (requires <strong>call_time</strong> column)</li>
            <li>Supports date formats: <strong>MM-DD-YYYY HH:MM</strong> or <strong>MM/DD/YYYY HH:MM:SS</strong></li>
            <li>Data will be grouped by ANI number</li>
            <li>Duration and Total Amount will be summed for each ANI</li>
            <li>Interest column calculated as: Total Amount × 1.30 (30% interest)</li>
            <li>New Excel file will download automatically</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default ExcelAmount;