import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

function SMSDataProcessor() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
        setFile(droppedFile);
        setError(null);
        setResults(null);
      } else {
        setError('Please upload an Excel file (.xlsx, .xls) or CSV file');
      }
    }
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setResults(null);
    }
  };

  const processFile = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Normalize column names (handle variations in spacing/casing)
      const normalizeKey = (key) => key?.toString().trim().toLowerCase().replace(/\s+/g, ' ');
      
      const colMap = {
        'from number': 'fromNumber',
        'message direction': 'messageDirection',
        'messaging product': 'messagingProduct',
        'message status': 'messageStatus',
        'campaign class': 'campaignClass',
        'sub-account name': 'customerName'
      };

      const normalizedData = jsonData.map(row => {
        const normalized = {};
        Object.keys(row).forEach(key => {
          const normKey = normalizeKey(key);
          if (colMap[normKey]) {
            normalized[colMap[normKey]] = row[key]?.toString().trim();
          }
        });
        return normalized;
      });

      // Apply filters
      const validStatuses = ['ACCEPTED', 'DELIVERED', 'SENT'];
      const filteredData = normalizedData.filter(row => {
        const direction = row.messageDirection?.toUpperCase();
        const product = row.messagingProduct;
        const status = row.messageStatus?.toUpperCase();
        const campaign = row.campaignClass;

        return (
          direction === 'OUTBOUND' &&
          product !== 'Short Code Reach' &&
          validStatuses.includes(status) &&
          campaign !== 'Unregistered'
        );
      });

      // Group by phone number and count messages
      const numberMap = new Map();
      filteredData.forEach(row => {
        const number = row.fromNumber;
        if (number) {
          if (numberMap.has(number)) {
            const existing = numberMap.get(number);
            existing.messages += 1;
            // Keep the first customer name found
          } else {
            numberMap.set(number, {
              number: number,
              customerName: row.customerName || '',
              messages: 1
            });
          }
        }
      });

      const resultArray = Array.from(numberMap.values());
      resultArray.sort((a, b) => b.messages - a.messages);

      setResults({
        data: resultArray,
        totalRecords: jsonData.length,
        filteredRecords: filteredData.length,
        uniqueNumbers: resultArray.length
      });
    } catch (err) {
      setError('Error processing file: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const exportToExcel = async () => {
    if (!results?.data?.length) return;

    const workbook = new ExcelJS.Workbook();

    // Sheet 1 - Original flat data
    const worksheet1 = workbook.addWorksheet('SMS Data');
    
    worksheet1.columns = [
      { header: 'Number', key: 'number', width: 20 },
      { header: 'Customer Name', key: 'customerName', width: 35 },
      { header: 'Messages', key: 'messages', width: 12 }
    ];

    results.data.forEach(item => {
      worksheet1.addRow({
        number: item.number,
        customerName: item.customerName,
        messages: item.messages
      });
    });

    // Sheet 2 - Grouped by customer with styling
    const worksheet2 = workbook.addWorksheet('By Customer');
    
    worksheet2.columns = [
      { header: 'Row Labels', key: 'rowLabels', width: 40 },
      { header: 'Sum of Messages', key: 'sumMessages', width: 20 }
    ];

    // Style the header row
    worksheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet2.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9BB65D' }
    };
    worksheet2.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };

    // Group data by customer
    const customerMap = new Map();
    
    results.data.forEach(item => {
      const customerName = item.customerName || 'Unknown';
      if (!customerMap.has(customerName)) {
        customerMap.set(customerName, {
          customerName: customerName,
          numbers: [],
          totalMessages: 0
        });
      }
      const customer = customerMap.get(customerName);
      customer.numbers.push({
        number: item.number,
        messages: item.messages
      });
      customer.totalMessages += item.messages;
    });

    // Sort customers by total messages
    const customerArray = Array.from(customerMap.values());
    customerArray.sort((a, b) => b.totalMessages - a.totalMessages);

    // Add data rows with styling
    customerArray.forEach(customer => {
      // Add customer row
      const customerRow = worksheet2.addRow({
        rowLabels: customer.customerName,
        sumMessages: customer.totalMessages
      });
      
      // Style customer row (light green)
      customerRow.font = { bold: true };
      customerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD5E6B5' }
      };
      customerRow.alignment = { vertical: 'middle', horizontal: 'left' };

      // Add number rows
      customer.numbers.forEach(numberData => {
        const numberRow = worksheet2.addRow({
          rowLabels: '  ' + numberData.number,
          sumMessages: numberData.messages
        });
        
        // Style number row (white background)
        numberRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' }
        };
        numberRow.alignment = { vertical: 'middle', horizontal: 'left' };
      });
    });

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SMS_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const resetProcessor = () => {
    setFile(null);
    setResults(null);
    setError(null);
  };

  return (
    <div className="processor-container">
      <div className="processor-header">
        <div className="header-icon sms-gradient">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h1>SMS Data Processor</h1>
          <p>Filter and analyze outbound SMS data</p>
        </div>
      </div>

      <div className="filter-info">
        <h3>Active Filters</h3>
        <div className="filter-tags">
          <span className="filter-tag include">Direction: OUTBOUND</span>
          <span className="filter-tag include">Status: ACCEPTED, DELIVERED, SENT</span>
          <span className="filter-tag exclude">Exclude: Short Code Reach</span>
          <span className="filter-tag exclude">Exclude: Unregistered Campaigns</span>
        </div>
      </div>

      {!results ? (
        <div
          className={`upload-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            id="file-upload"
            hidden
          />
          
          {file ? (
            <div className="file-selected">
              <div className="file-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="file-name">{file.name}</p>
              <p className="file-size">{(file.size / 1024).toFixed(2)} KB</p>
              <div className="file-actions">
                <button className="process-btn" onClick={processFile} disabled={processing}>
                  {processing ? (
                    <>
                      <span className="spinner"></span>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Process File
                    </>
                  )}
                </button>
                <button className="change-btn" onClick={() => document.getElementById('file-upload').click()}>
                  Change File
                </button>
              </div>
            </div>
          ) : (
            <label htmlFor="file-upload" className="upload-label">
              <div className="upload-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="upload-text">Drag & drop your Excel file here</p>
              <p className="upload-subtext">or click to browse</p>
              <span className="upload-formats">Supports: .xlsx, .xls, .csv</span>
            </label>
          )}
        </div>
      ) : (
        <div className="results-section">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-value">{results.totalRecords.toLocaleString()}</span>
                <span className="stat-label">Total Records</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-value">{results.filteredRecords.toLocaleString()}</span>
                <span className="stat-label">Filtered Records</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="stat-info">
                <span className="stat-value">{results.uniqueNumbers.toLocaleString()}</span>
                <span className="stat-label">Unique Numbers</span>
              </div>
            </div>
          </div>

          <div className="results-table-container">
            <div className="table-header">
              <h3>Processed Data</h3>
              <div className="table-actions">
                <button className="export-btn" onClick={exportToExcel}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Excel
                </button>
                <button className="reset-btn" onClick={resetProcessor}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  New File
                </button>
              </div>
            </div>
            
            <div className="table-wrapper">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Number</th>
                    <th>Customer Name</th>
                    <th>Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.slice(0, 100).map((item, idx) => (
                    <tr key={idx}>
                      <td className="row-num">{idx + 1}</td>
                      <td className="phone-cell">{item.number}</td>
                      <td>{item.customerName || '-'}</td>
                      <td className="msg-count">{item.messages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.data.length > 100 && (
                <div className="table-note">
                  Showing first 100 of {results.data.length} records. Export to see all.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}

export default SMSDataProcessor;