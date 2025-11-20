import { useState } from 'react';
import TollFreeAnalyzer from './TollFreeAnalyzer';
import ExcelAmountProcessor from './ExcelAmount';
import './App.css';
import  tollfree from './assets/tollfree.svg';
import international from './assets/international.svg';
function App() {
  const [selectedTool, setSelectedTool] = useState(null);

  const tools = [
    {
      id: 'toll-free',
      name: 'Toll-Free Call ',
      description: 'Advanced call analytics with automated billing reports and customer matching',
      icon: tollfree,
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      features: ['Call Duration Analysis', 'Automated Billing', 'Customer Matching']
    },
    {
      id: 'excel-amount',
      name: 'International Minutes',
      description: 'Smart data grouping with automatic interest calculations and export file',
      icon: international,
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      features: ['Data Grouping', 'Interest Calculator', 'Auto Export']
    }
  ];

  const handleBack = () => {
    setSelectedTool(null);
  };

  if (selectedTool === 'toll-free') {
    return (
      <div className="app-wrapper">
        <button className="back-button" onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Tools
        </button>
        <TollFreeAnalyzer />
      </div>
    );
  }

  if (selectedTool === 'excel-amount') {
    return (
      <div className="app-wrapper">
        <button className="back-button" onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Tools
        </button>
        <ExcelAmountProcessor />
      </div>
    );
  }

  return (
    <div className="main-container">

      <div className="tools-container">
        <div className="tools-header">
          <h2>Choose Your Tool</h2>
          <p>Select the tool that best fits your needs</p>
        </div>

        <div className="tools-grid">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="tool-card-modern"
              onClick={() => setSelectedTool(tool.id)}
            >
              <div className="tool-card-header" style={{ background: tool.gradient }}>
                <div className="tool-icon-large">
                  <img src={tool.icon} alt={tool.name} />
                </div>
              </div>
              
              <div className="tool-card-body">
                <h3 className="tool-title">{tool.name}</h3>
                <p className="tool-desc">{tool.description}</p>
                
                <div className="tool-features">
                  {tool.features.map((feature, idx) => (
                    <div key={idx} className="feature-badge">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </div>
                  ))}
                </div>

                <button className="tool-launch-btn" style={{ background: tool.gradient }}>
                  Launch Tool
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="info-cards">
          <div className="info-card">
            <div className="info-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h4>Lightning Fast</h4>
            <p>Process thousands of records in seconds with optimized algorithms</p>
          </div>

          <div className="info-card">
            <div className="info-icon" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h4>Secure Processing</h4>
            <p>All data processed locally in your browser - nothing sent to servers</p>
          </div>

          <div className="info-card">
            <div className="info-icon" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </div>
            <h4>Auto Export</h4>
            <p>Professional Excel reports generated automatically with detailed insights</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;