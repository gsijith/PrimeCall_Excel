import { useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import './ExcelAmount.css';

function ExcelAmount() {
  // Mode selection: 'process' or 'compare'
  const [mode, setMode] = useState('process');

  // States for Process Mode
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // States for Compare Mode
  const [clientFile, setClientFile] = useState(null);
  const [dataFile, setDataFile] = useState(null);
  const [compareProcessing, setCompareProcessing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [compareSuccess, setCompareSuccess] = useState('');
  const [comparePreview, setComparePreview] = useState(null);

  // Reset states when switching modes
  const handleModeChange = (newMode) => {
    setMode(newMode);
    // Reset process mode states
    setFiles([]);
    setError('');
    setSuccess('');
    setPreviewData(null);
    // Reset compare mode states
    setClientFile(null);
    setDataFile(null);
    setCompareError('');
    setCompareSuccess('');
    setComparePreview(null);
  };

  // ============ PROCESS MODE FUNCTIONS ============

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    
    const validFiles = [];
    const invalidFiles = [];
    
    selectedFiles.forEach(file => {
      const fileName = file.name.toLowerCase();
      const isValidExtension = fileName.endsWith('.xlsx') || 
                               fileName.endsWith('.xls') || 
                               fileName.endsWith('.csv');
      
      if (validTypes.includes(file.type) || isValidExtension) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });
    
    if (invalidFiles.length > 0) {
      setError(`Invalid files skipped: ${invalidFiles.join(', ')}`);
    } else {
      setError('');
    }
    
    if (validFiles.length > 0) {
      setFiles(prevFiles => [...prevFiles, ...validFiles]);
      setSuccess('');
      setPreviewData(null);
    }
    
    e.target.value = '';
  };

  const removeFile = (indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    setError('');
    setSuccess('');
    setPreviewData(null);
  };

  const clearAllFiles = () => {
    setFiles([]);
    setError('');
    setSuccess('');
    setPreviewData(null);
  };

  const parseCallTime = (callTimeStr) => {
    if (!callTimeStr) return null;
    try {
      const cleanStr = String(callTimeStr).trim().replace(/\s+/g, ' ');
      const parts = cleanStr.split(' ');
      const datePart = parts[0];
      const timePart = parts[1] || '00:00:00';
      if (!datePart) return null;
      
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
      if (year < 100) year = 2000 + year;
      
      const timeParts = timePart.split(':');
      const hours = parseInt(timeParts[0]) || 0;
      const minutes = parseInt(timeParts[1]) || 0;
      const seconds = parseInt(timeParts[2]) || 0;
      
      const date = new Date(year, month - 1, day, hours, minutes, seconds);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  };

  const isDateInRange = (callTimeStr, startDateStr, endDateStr) => {
    const callDate = parseCallTime(callTimeStr);
    if (!callDate) return false;
    
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
    if (startDateTime && callDate < startDateTime) return false;
    if (endDateTime && callDate > endDateTime) return false;
    return true;
  };

  const readExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Failed to read Excel file: ' + error.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const normalizeANI = (ani) => {
    let normalized = String(ani || '').trim();
    // Remove +, spaces, dashes, parentheses
    normalized = normalized.replace(/[+\s\-()]/g, '');
    // Remove leading "1" if it's an 11-digit US number
    if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = normalized.substring(1);
    }
    return normalized;
  };

  const groupAndCalculate = (data, filterByDate = false, start = null, end = null) => {
    const grouped = {};

    data.forEach((row) => {
      const normalizedRow = {};
      Object.keys(row).forEach(key => {
        normalizedRow[key.toLowerCase().trim()] = row[key];
      });

      if (filterByDate) {
        const callTime = normalizedRow.call_time;
        if (!callTime) return;
        const parsedDate = parseCallTime(callTime);
        if (!parsedDate) return;
        if (!isDateInRange(callTime, start, end)) return;
      }

      const ani = normalizeANI(normalizedRow.ani);
      const duration = parseFloat(normalizedRow.duration) || 0;
      const totalAmount = parseFloat(normalizedRow.total_amount) || 0;

      if (!ani) return;

      if (!grouped[ani]) {
        grouped[ani] = { ani, duration: 0, total_amount: 0, count: 0 };
      }

      grouped[ani].duration += duration;
      grouped[ani].total_amount += totalAmount;
      grouped[ani].count += 1;
    });

    const result = Object.values(grouped).map(item => {
      const interestAmount = item.total_amount * 1.30;
      return {
        ani: item.ani,
        'duration': item.duration.toFixed(2),
        'total_amount': item.total_amount.toFixed(2),
        'Amount with Interest (30%)': interestAmount.toFixed(2),
        'Number of Records': item.count
      };
    });

    return result.sort((a, b) => a.ani.localeCompare(b.ani));
  };

  const generateExcelFile = (processedData, filterByDate, start, end, filePrefix = 'processed_data') => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(processedData);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Processed Data');
    
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const dateRangeSuffix = filterByDate ? `_${start || 'start'}_to_${end || 'end'}` : '';
    saveAs(dataBlob, `${filePrefix}${dateRangeSuffix}_${timestamp}.xlsx`);
  };

  const processExcelFiles = async () => {
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

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
      let allData = [];
      let processedFilesCount = 0;
      
      for (const file of files) {
        const data = await readExcelFile(file);
        if (!data || data.length === 0) continue;

        const columns = Object.keys(data[0]).map(col => col.toLowerCase().trim());
        const requiredColumns = ['ani', 'duration', 'total_amount'];
        const missingColumns = requiredColumns.filter(col => !columns.includes(col));

        if (missingColumns.length > 0) {
          throw new Error(`File "${file.name}" is missing required columns: ${missingColumns.join(', ')}`);
        }

        if (useDateFilter && !columns.includes('call_time')) {
          throw new Error(`File "${file.name}" is missing "call_time" column`);
        }

        allData = allData.concat(data);
        processedFilesCount++;
      }

      if (allData.length === 0) {
        throw new Error('No valid data found in any of the uploaded files');
      }

      const processedData = groupAndCalculate(allData, useDateFilter, startDate, endDate);
      
      if (processedData.length === 0) {
        throw new Error('No records found matching the specified criteria');
      }
      
      setPreviewData(processedData.slice(0, 5));
      generateExcelFile(processedData, useDateFilter, startDate, endDate);
      
      const dateRangeMsg = useDateFilter 
        ? ` within date range (${startDate || 'Start'} to ${endDate || 'End'})` 
        : '';
      
      setSuccess(`Successfully processed ${allData.length} total rows from ${processedFilesCount} file(s) into ${processedData.length} grouped entries${dateRangeMsg}`);
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // ============ COMPARE MODE FUNCTIONS ============

  const handleClientFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setClientFile(file);
      setCompareError('');
      setCompareSuccess('');
      setComparePreview(null);
    }
    e.target.value = '';
  };

  const handleDataFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setDataFile(file);
      setCompareError('');
      setCompareSuccess('');
      setComparePreview(null);
    }
    e.target.value = '';
  };

  const processCompareFiles = async () => {
    if (!clientFile || !dataFile) {
      setCompareError('Please upload both Client List and Call Data files');
      return;
    }

    setCompareProcessing(true);
    setCompareError('');
    setCompareSuccess('');

    try {
      // Read both files
      const clientData = await readExcelFile(clientFile);
      const callData = await readExcelFile(dataFile);

      if (!clientData || clientData.length === 0) {
        throw new Error('Client list file is empty');
      }
      if (!callData || callData.length === 0) {
        throw new Error('Call data file is empty');
      }

      // Validate client file columns
      const clientColumns = Object.keys(clientData[0]).map(col => col.toLowerCase().trim());
      if (!clientColumns.includes('phone number') && !clientColumns.includes('phone_number')) {
        throw new Error('Client file missing "Phone Number" column');
      }
      if (!clientColumns.includes('domain')) {
        throw new Error('Client file missing "Domain" column');
      }
      if (!clientColumns.includes('enable')) {
        throw new Error('Client file missing "Enable" column');
      }

      // Validate call data columns
      const callColumns = Object.keys(callData[0]).map(col => col.toLowerCase().trim());
      if (!callColumns.includes('ani')) {
        throw new Error('Call data file missing "ani" column');
      }
      if (!callColumns.includes('duration')) {
        throw new Error('Call data file missing "duration" column');
      }
      if (!callColumns.includes('total_amount')) {
        throw new Error('Call data file missing "total_amount" column');
      }

      // Step 1: Get enabled phone numbers with their domains (no duplicates)
      const phoneToDomai = new Map();
      
      clientData.forEach(row => {
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.toLowerCase().trim().replace(/\s+/g, '_')] = row[key];
        });

        const enable = String(normalizedRow.enable || '').trim().toLowerCase();
        if (enable === 'yes') {
          const phoneNumber = normalizeANI(normalizedRow.phone_number || normalizedRow['phone number']);
          const domain = String(normalizedRow.domain || '').trim();
          
          if (phoneNumber && domain && !phoneToDomai.has(phoneNumber)) {
            phoneToDomai.set(phoneNumber, domain);
          }
        }
      });

      if (phoneToDomai.size === 0) {
        throw new Error('No enabled phone numbers found in client list');
      }

      // Step 2: Group call data by ANI and match with client phone numbers
      const grouped = {};

      callData.forEach(row => {
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.toLowerCase().trim()] = row[key];
        });

        const ani = normalizeANI(normalizedRow.ani);
        const duration = parseFloat(normalizedRow.duration) || 0;
        const totalAmount = parseFloat(normalizedRow.total_amount) || 0;

        if (!ani) return;

        // Check if this ANI is in our client list
        if (phoneToDomai.has(ani)) {
          const domain = phoneToDomai.get(ani);
          
          if (!grouped[domain]) {
            grouped[domain] = {
              domain: domain,
              duration: 0,
              total_amount: 0,
              count: 0
            };
          }

          grouped[domain].duration += duration;
          grouped[domain].total_amount += totalAmount;
          grouped[domain].count += 1;
        }
      });

      if (Object.keys(grouped).length === 0) {
        throw new Error('No matching phone numbers found between the two files');
      }

      // Step 3: Create result with domain names
      const result = Object.values(grouped).map(item => {
        const durationInMinutes = item.duration / 60; // Convert seconds to minutes
        const interestAmount = item.total_amount * 1.30;
        
        return {
          'ANI': item.domain,
          'Total Duration (Minutes)': durationInMinutes.toFixed(2),
          'Total Amount': item.total_amount.toFixed(2),
          'Amount with Interest (30%)': interestAmount.toFixed(2),
          'Number of Records': item.count
        };
      });

      result.sort((a, b) => a.ANI.localeCompare(b.ANI));

      // Show preview
      setComparePreview(result.slice(0, 5));

      // Generate Excel
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result);
      ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Comparison Result');
      
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const dataBlob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      saveAs(dataBlob, `comparison_result_${timestamp}.xlsx`);

      setCompareSuccess(`Successfully matched ${result.length} domains from ${phoneToDomai.size} enabled numbers`);
    } catch (err) {
      setCompareError(`Error: ${err.message}`);
    } finally {
      setCompareProcessing(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="app-container">
      <div className="card">
        <h1>Excel Data Processor</h1>
        <p className="subtitle">Process call data or compare files to generate reports</p>

        {/* Mode Selection Tabs */}
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'process' ? 'active' : ''}`}
            onClick={() => handleModeChange('process')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Process Files
          </button>
          <button
            className={`mode-tab ${mode === 'compare' ? 'active' : ''}`}
            onClick={() => handleModeChange('compare')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Compare Files
          </button>
        </div>

        {/* Process Mode */}
        {mode === 'process' && (
          <div className="mode-content">
            <div className="upload-section">
              <label htmlFor="file-upload" className="file-label">
                <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>{files.length === 0 ? 'Choose Excel File(s)' : `${files.length} file(s) selected`}</span>
                <input id="file-upload" type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleFileChange} className="file-input" />
              </label>

              {files.length > 0 && (
                <div className="files-list-container">
                  <div className="files-list-header">
                    <span className="files-list-title">Selected Files ({files.length})</span>
                    <button onClick={clearAllFiles} className="clear-all-button">Clear All</button>
                  </div>
                  <div className="files-list">
                    {files.map((file, index) => (
                      <div key={index} className="file-item">
                        <div className="file-item-info">
                          <svg className="file-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="file-details">
                            <div className="file-name">{file.name}</div>
                            <div className="file-size">{formatFileSize(file.size)}</div>
                          </div>
                        </div>
                        <button onClick={() => removeFile(index)} className="remove-button" title="Remove file">
                          <svg className="remove-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="date-filter-section">
                <div className="date-filter-toggle">
                  <input type="checkbox" id="date-filter-checkbox" checked={useDateFilter} onChange={(e) => setUseDateFilter(e.target.checked)} className="checkbox-input" />
                  <label htmlFor="date-filter-checkbox" className="checkbox-label">
                    <svg className="calendar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Filter by Date Range
                  </label>
                </div>

                {useDateFilter && (
                  <div className="date-inputs">
                    <div className="date-input-group">
                      <label htmlFor="start-date">Start Date</label>
                      <input type="date" id="start-date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="date-input" />
                    </div>
                    <div className="date-input-group">
                      <label htmlFor="end-date">End Date</label>
                      <input type="date" id="end-date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="date-input" />
                    </div>
                  </div>
                )}
              </div>

              <button onClick={processExcelFiles} disabled={files.length === 0 || processing} className="process-button">
                {processing ? (<><span className="spinner"></span>Processing...</>) : 'Process File(s)'}
              </button>
            </div>

            {error && (
              <div className="alert alert-error">
                <svg className="alert-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
                {error}
              </div>
            )}

            {success && (
              <div className="alert alert-success">
                <svg className="alert-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
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
                      <tr>{Object.keys(previewData[0]).map((key) => (<th key={key}>{key}</th>))}</tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, idx) => (
                        <tr key={idx}>{Object.values(row).map((value, i) => (<td key={i}>{value}</td>))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="info-section">
              <h3>How it works:</h3>
              <ol>
                <li>Upload one or multiple Excel files (.xlsx, .xls, or .csv)</li>
                <li>All files must contain columns: <strong>ani</strong>, <strong>duration</strong>, <strong>total_amount</strong></li>
                <li><strong>Optional:</strong> Enable date range filter (requires <strong>call_time</strong> column)</li>
                <li>Data will be combined and grouped by ANI number</li>
                <li>Interest column calculated as: Total Amount × 1.30 (30% interest)</li>
              </ol>
            </div>
          </div>
        )}

        {/* Compare Mode */}
        {mode === 'compare' && (
          <div className="mode-content">
            <div className="upload-section">
              {/* Client List File */}
              <div className="compare-file-section">
                <h4>1. Client List File</h4>
                <p className="file-description">Excel with columns: Phone Number, Domain, Enable</p>
                <label htmlFor="client-file-upload" className="file-label">
                  <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{clientFile ? clientFile.name : 'Choose Client List File'}</span>
                  <input id="client-file-upload" type="file" accept=".xlsx,.xls,.csv" onChange={handleClientFileChange} className="file-input" />
                </label>
                {clientFile && (
                  <div className="selected-file-info">
                    <span>✓ {clientFile.name} ({formatFileSize(clientFile.size)})</span>
                    <button onClick={() => setClientFile(null)} className="remove-file-btn">Remove</button>
                  </div>
                )}
              </div>

              {/* Call Data File */}
              <div className="compare-file-section">
                <h4>2. Call Data File</h4>
                <p className="file-description">Excel with columns: ani, duration, total_amount</p>
                <label htmlFor="data-file-upload" className="file-label">
                  <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{dataFile ? dataFile.name : 'Choose Call Data File'}</span>
                  <input id="data-file-upload" type="file" accept=".xlsx,.xls,.csv" onChange={handleDataFileChange} className="file-input" />
                </label>
                {dataFile && (
                  <div className="selected-file-info">
                    <span>✓ {dataFile.name} ({formatFileSize(dataFile.size)})</span>
                    <button onClick={() => setDataFile(null)} className="remove-file-btn">Remove</button>
                  </div>
                )}
              </div>

              <button onClick={processCompareFiles} disabled={!clientFile || !dataFile || compareProcessing} className="process-button">
                {compareProcessing ? (<><span className="spinner"></span>Comparing...</>) : 'Compare & Generate Report'}
              </button>
            </div>

            {compareError && (
              <div className="alert alert-error">
                <svg className="alert-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
                {compareError}
              </div>
            )}

            {compareSuccess && (
              <div className="alert alert-success">
                <svg className="alert-icon" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
                {compareSuccess}
              </div>
            )}

            {comparePreview && comparePreview.length > 0 && (
              <div className="preview-section">
                <h3>Preview (First 5 rows)</h3>
                <div className="table-container">
                  <table className="preview-table">
                    <thead>
                      <tr>{Object.keys(comparePreview[0]).map((key) => (<th key={key}>{key}</th>))}</tr>
                    </thead>
                    <tbody>
                      {comparePreview.map((row, idx) => (
                        <tr key={idx}>{Object.values(row).map((value, i) => (<td key={i}>{value}</td>))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="info-section">
              <h3>How Compare Mode works:</h3>
              <ol>
                <li>Upload <strong>Client List</strong> file with: Phone Number, Domain, Enable columns</li>
                <li>Upload <strong>Call Data</strong> file with: ani, duration, total_amount columns</li>
                <li>System extracts phone numbers where Enable = "yes" with their domains</li>
                <li>Matches these numbers against the call data ANI column</li>
                <li>Groups by domain and calculates totals (duration in minutes)</li>
                <li>Generates report with 30% interest calculation</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExcelAmount;