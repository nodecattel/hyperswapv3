import React from 'react';
import Dashboard from './components/Dashboard';
import './styles/index.css';

function App() {
  console.log('🎯 App component rendering...');

  return (
    <div className="App">
      <Dashboard />
    </div>
  );
}

export default App;
