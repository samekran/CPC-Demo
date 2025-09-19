import React, { useState, useEffect, useRef } from 'react';
import { X, HelpCircle, ChevronDown, ChevronRight, Play, Pause, Square, Bot } from 'lucide-react';

// Type definitions
interface TestCase {
  id: string;
  name: string;
  filename: string;
  description: string;
}

interface IcdCode {
  code: string;
  description: string;
}

interface EmCode {
  code: string;
  description: string;
  modifiers: string;
  units: string;
  icd10: string;
  billChecked?: boolean;
}

interface MiscService {
  code: string;
  description: string;
  modifiers: string;
  units: string;
  icd10Codes: IcdCode[];
  billChecked: boolean;
}

interface AgentLog {
  id: number;
  timestamp: string;
  action: string;
  reasoning: string;
  confidence: number;
  step: number;
}

interface TreeNode {
  files?: TestCase[];
  folders?: { [key: string]: TreeNode };
}

function buildTree(testCases: TestCase[]): TreeNode {
  const root: TreeNode = {};
  for (const testCase of testCases) {
    const parts = testCase.filename.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // file
        if (!node.files) node.files = [];
        node.files.push({ ...testCase, name: part });
      } else {
        // folder
        if (!node.folders) node.folders = {};
        if (!node.folders[part]) node.folders[part] = {};
        node = node.folders[part];
      }
    }
  }
  return root;
}

function TreeDropdown({ tree, expanded, onToggle, onSelect, selectedFile, path = '' }: {
  tree: TreeNode;
  expanded: { [key: string]: boolean };
  onToggle: (path: string) => void;
  onSelect: (id: string) => void;
  selectedFile: string;
  path?: string;
}) {
  return (
    <div style={{ minWidth: 220, background: '#f8fafc', borderRadius: 6, padding: 4 }}>
      {tree.folders &&
        Object.entries(tree.folders).map(([folder, subtree]) => {
          const folderPath = path ? `${path}/${folder}` : folder;
          const isOpen = expanded[folderPath];
          return (
            <div key={folder}>
              <div
                style={{
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: 4,
                  background: isOpen ? '#ede9fe' : 'transparent',
                  color: '#6d28d9',
                  marginBottom: 2,
                }}
                onClick={() => onToggle(folderPath)}
                onMouseOver={e => (e.currentTarget.style.background = '#ede9fe')}
                onMouseOut={e => (e.currentTarget.style.background = isOpen ? '#ede9fe' : 'transparent')}
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span style={{ marginLeft: 4 }}>{folder}</span>
              </div>
              {isOpen && (
                <div style={{ marginLeft: 16, borderLeft: '2px solid #ddd', paddingLeft: 8 }}>
                  <TreeDropdown
                    tree={subtree}
                    expanded={expanded}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    selectedFile={selectedFile}
                    path={folderPath}
                  />
                </div>
              )}
            </div>
          );
        })}
      {tree.files &&
        tree.files.map((file) => (
          <div
            key={file.id}
            style={{
              cursor: 'pointer',
              background: selectedFile === file.id ? '#c7d2fe' : 'transparent',
              color: selectedFile === file.id ? '#1e293b' : '#334155',
              padding: '4px 12px',
              borderRadius: 4,
              marginLeft: 20,
              marginBottom: 2,
              fontWeight: selectedFile === file.id ? 'bold' : 'normal',
            }}
            onClick={() => onSelect(file.id)}
            onMouseOver={e => (e.currentTarget.style.background = '#e0e7ff')}
            onMouseOut={e => (e.currentTarget.style.background = selectedFile === file.id ? '#c7d2fe' : 'transparent')}
          >
            {file.name.replace('.json', '')}
          </div>
        ))}
    </div>
  );
}

export default function MedicalBillingInterface() {
  // Test case management
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [testCaseTree, setTestCaseTree] = useState<TreeNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<{ [key: string]: boolean }>({});
  const [selectedTestCase, setSelectedTestCase] = useState<string>('');
  const [loadingTestCase, setLoadingTestCase] = useState<boolean>(false);

  const [icdCodes, setIcdCodes] = useState<IcdCode[]>([
    { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
    { code: 'E78.5', description: 'Hyperlipidemia, unspecified' },
    { code: 'I10', description: 'Essential (primary) hypertension' }
  ]);

  const [emCode, setEmCode] = useState<EmCode>({
    code: '99214',
    description: 'EST PT LEVEL 4 OF 5',
    modifiers: '',
    units: '1',
    icd10: 'E11.9\nE78.5\nI10'
  });

  const [addedMiscServices, setAddedMiscServices] = useState<MiscService[]>([]);

  const [newIcdCode, setNewIcdCode] = useState<string>('');
  const [newIcdDescription, setNewIcdDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [diagnosisText, setDiagnosisText] = useState<string>('Patient seen in office today for diabetes. Diabetes is well controlled. Abnormal findings/complications include INSERT TEXT HERE. Patient advised on medication compliance and to maintain blood sugar logbook before and after meals to bring back for next visit. Advised on diet and regular exercise. Patient needs to perform proper and frequent foot care and needs to see ophthalmologist yearly. Other Instructions: INSERT TEXT HERE. Further diagnostic testing per orders below. Patient to follow up as directed.');

  // 1. Add state for E&M bill checkbox
  const [emBillChecked, setEmBillChecked] = useState<boolean>(true);

  // Agent state
  const [agentState, setAgentState] = useState({
    isRunning: false,
    isPaused: false,
    currentStep: 0,
    totalSteps: 0
  });
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0, visible: false });
  const [highlightedElement, setHighlightedElement] = useState<string | null>(null);
  const agentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const agentStepRef = useRef<number>(0);
  const agentStateRef = useRef(agentState);

  // Load test cases on component mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadTestCases();
  }, []);

  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  const loadTestCases = async () => {
    try {
      const response = await fetch('/test-cases/index.json');
      const data = await response.json();
      setTestCases(data.testCases);
      setTestCaseTree(buildTree(data.testCases));
      
      // Automatically select the telehealth visit test case as default
      const telehealthTestCase = data.testCases.find((tc: TestCase) => tc.id === 'telehealth-visit');
      if (telehealthTestCase) {
        // Load the telehealth visit test case directly without going through loadTestCase
        const testCaseResponse = await fetch(`/test-cases/${telehealthTestCase.filename}`);
        const testCaseData = await testCaseResponse.json();
        
        // Apply test case data to form
        setIcdCodes(testCaseData.icdCodes || []);
        setEmCode(testCaseData.emCode || { code: '', description: '', units: '1', icd10: '' });
        setAddedMiscServices(testCaseData.addedMiscServices || []);
        setNotes(testCaseData.notes || '');
        setDiagnosisText(testCaseData.diagnosisText || '');
        setEmBillChecked(testCaseData.emCode?.billChecked !== false);
        
        setSelectedTestCase('telehealth-visit');
      }
    } catch (error) {
      console.error('Error loading test cases:', error);
    }
  };

  const loadTestCase = async (testCaseId: string) => {
    setLoadingTestCase(true);
    try {
      const testCase = testCases.find(tc => tc.id === testCaseId);
      if (testCase) {
        const response = await fetch(`/test-cases/${testCase.filename}`);
        const data = await response.json();
        
        // Apply test case data to form
        setIcdCodes(data.icdCodes || []);
        setEmCode(data.emCode || { code: '', description: '', units: '1', icd10: '' });
        setAddedMiscServices(data.addedMiscServices || []);
        setNotes(data.notes || '');
        setDiagnosisText(data.diagnosisText || '');
        setEmBillChecked(data.emCode?.billChecked !== false);
        
        setSelectedTestCase(testCaseId);
      }
    } catch (error) {
      console.error('Error loading test case:', error);
    } finally {
      setLoadingTestCase(false);
    }
  };

  const removeIcdCode = (index: number) => {
    setIcdCodes(icdCodes.filter((_, i) => i !== index));
  };

  // Function to add misc code (used in the Add button)
  const addMiscService = () => {
    if (newIcdCode) {
      const newService: MiscService = {
        code: newIcdCode,
        description: '',
        modifiers: '',
        units: '1',
        icd10Codes: [],
        billChecked: true
      };
      setAddedMiscServices([...addedMiscServices, newService]);
      setNewIcdCode('');
    }
  };

  const removeMiscService = (index: number) => {
    setAddedMiscServices(addedMiscServices.filter((_, i) => i !== index));
  };

  const updateMiscService = (index: number, field: keyof MiscService, value: any) => {
    const updated = [...addedMiscServices];
    (updated[index] as any)[field] = value;
    setAddedMiscServices(updated);
  };

  const addIcdToMiscService = (serviceIndex: number) => {
    if (newIcdCode && newIcdDescription) {
      const updated = [...addedMiscServices];
      updated[serviceIndex].icd10Codes.push({ code: newIcdCode, description: newIcdDescription });
      setAddedMiscServices(updated);
      setNewIcdCode('');
      setNewIcdDescription('');
    }
  };

  const removeIcdFromMiscService = (serviceIndex: number, icdIndex: number) => {
    const updated = [...addedMiscServices];
    updated[serviceIndex].icd10Codes = updated[serviceIndex].icd10Codes.filter((_, i) => i !== icdIndex);
    setAddedMiscServices(updated);
  };

  // Agent functions
  const addAgentLog = (action: string, reasoning: string, confidence: number = 1.0) => {
    const logEntry: AgentLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      action,
      reasoning,
      confidence,
      step: agentStepRef.current
    };
    setAgentLogs(prev => [...prev, logEntry]);
  };

  const moveCursorToElement = (elementId: string, callback?: () => void) => {
    const element = document.getElementById(elementId);
    if (element) {
      const rect = element.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      
      // Calculate position relative to viewport, accounting for scroll
      const x = rect.left + rect.width / 2 + scrollX;
      const y = rect.top + rect.height / 2 + scrollY;
      
      setCursorPosition({ x, y, visible: true });
      setHighlightedElement(elementId);
      
      // Scroll the element into view smoothly
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center', 
        inline: 'center' 
      });
      
      // Add a click effect by temporarily adding a class
      setTimeout(() => {
        element.classList.add('agent-click-effect');
        setTimeout(() => {
          element.classList.remove('agent-click-effect');
        }, 200);
      }, 1000);
      
      setTimeout(() => {
        if (callback) callback();
      }, 1500); // Increased delay to allow for scroll animation
    }
  };

  const clearHighlight = () => {
    setHighlightedElement(null);
    setCursorPosition(prev => ({ ...prev, visible: false }));
  };

  const agentActions = {
    // Test Case 1: Telehealth - Add modifier 95
    telehealth: [
      {
        action: () => {
          addAgentLog("Analyzing diagnosis text for telehealth indicators", "Looking for video platform mentions and telehealth keywords", 0.95);
          moveCursorToElement('diagnosis-textarea', () => {
            addAgentLog("Found telehealth indicators in diagnosis text", "Detected telehealth visit context", 0.95);
          });
        },
        delay: 2000
      },
      {
        action: () => {
          addAgentLog("Checking E&M modifiers for modifier 95", "Telehealth visits require modifier 95 on E/M codes", 1.0);
          moveCursorToElement('em-modifiers-input', () => {
            addAgentLog("Found missing modifier 95 in E/M modifiers", "E/M codes for telehealth must have modifier 95", 1.0);
          });
        },
        delay: 2000
      },
      {
        action: () => {
          addAgentLog("Adding modifier 95 to E/M modifiers", "Required for proper telehealth billing", 1.0);
          setEmCode(prev => ({ ...prev, modifiers: '95' }));
          clearHighlight();
        },
        delay: 1500
      },
      {
        action: () => {
          addAgentLog("Telehealth billing correction complete", "E/M code now has required modifier 95", 1.0);
        },
        delay: 1000
      }
    ],
    
    // Test Case 2: Obesity - Move to secondary diagnosis
    obesity: [
      {
        action: () => {
          addAgentLog("Analyzing ICD-10 codes order", "Checking if obesity is incorrectly listed as primary diagnosis", 0.9);
          moveCursorToElement('icd-codes-section', () => {
            addAgentLog("Found obesity (E66.9) as primary diagnosis", "Obesity should typically be secondary to the main condition", 0.9);
          });
        },
        delay: 2000
      },
      {
        action: () => {
          addAgentLog("Reordering diagnosis codes", "Moving obesity to secondary position, diabetes to primary", 1.0);
          const reorderedCodes = [
            { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
            { code: 'E66.9', description: 'Obesity, unspecified' },
            { code: 'I10', description: 'Essential (primary) hypertension' }
          ];
          setIcdCodes(reorderedCodes);
          clearHighlight();
        },
        delay: 1500
      },
      {
        action: () => {
          addAgentLog("Diagnosis reordering complete", "Primary diagnosis now reflects the main reason for visit (diabetes)", 1.0);
        },
        delay: 1000
      }
    ]
  };

  const runAgent = () => {
    if (agentStateRef.current.isRunning) return;

    const testCaseActions = selectedTestCase === 'telehealth-visit' ? agentActions.telehealth : agentActions.obesity;

    const initialAgentState = {
      isRunning: true,
      isPaused: false,
      currentStep: 0,
      totalSteps: testCaseActions.length
    };

    agentStateRef.current = initialAgentState;
    setAgentState(initialAgentState);

    setAgentLogs([]);
    agentStepRef.current = 0;

    const executeStep = (stepIndex: number) => {
      // Check if agent should stop before each step
      if (!agentStateRef.current.isRunning) {
        return;
      }

      // If paused, wait and try again
      if (agentStateRef.current.isPaused) {
        agentTimeoutRef.current = setTimeout(() => {
          executeStep(stepIndex);
        }, 100);
        return;
      }

      if (stepIndex >= testCaseActions.length) {
        // Stop the agent after completing all steps
        const stopState = {
          isRunning: false,
          isPaused: false,
          currentStep: testCaseActions.length,
          totalSteps: testCaseActions.length
        };
        agentStateRef.current = stopState;
        setAgentState(stopState);
        clearHighlight();
        return;
      }

      agentStepRef.current = stepIndex;
      setAgentState(prev => {
        const nextState = { ...prev, currentStep: stepIndex + 1 };
        agentStateRef.current = nextState;
        return nextState;
      });

      const step = testCaseActions[stepIndex];
      step.action();

      agentTimeoutRef.current = setTimeout(() => {
        // Double-check if still running before proceeding
        if (agentStateRef.current.isRunning) {
          executeStep(stepIndex + 1);
        }
      }, step.delay);
    };

    executeStep(0);
  };

  const pauseAgent = () => {
    setAgentState(prev => {
      const nextState = { ...prev, isPaused: !prev.isPaused };
      agentStateRef.current = nextState;
      return nextState;
    });
    if (agentTimeoutRef.current) {
      clearTimeout(agentTimeoutRef.current);
      agentTimeoutRef.current = null;
    }
  };

  const stopAgent = () => {
    // Clear any pending timeouts
    if (agentTimeoutRef.current) {
      clearTimeout(agentTimeoutRef.current);
      agentTimeoutRef.current = null;
    }
    
    const resetState = {
      isRunning: false,
      isPaused: false,
      currentStep: 0,
      totalSteps: 0
    };
    
    // Force immediate update of ref
    agentStateRef.current = resetState;
    setAgentState(resetState);
    clearHighlight();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (agentTimeoutRef.current) {
        clearTimeout(agentTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Agent Cursor */}
      {cursorPosition.visible && (
        <div
          className="agent-cursor"
          style={{
            left: cursorPosition.x - 10,
            top: cursorPosition.y - 10,
          }}
        />
      )}
      
      {/* Main EMR Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-purple-800 text-white">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center space-x-6">
            <div className="text-white font-bold text-lg">athenaNet</div>
            <nav className="flex space-x-4 text-sm">
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Calendar</button>
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Patients</button>
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Claims</button>
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Financials</button>
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Reports</button>
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Quality</button>
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Apps</button>
              <button className="hover:text-purple-200 bg-transparent border-none text-white">Support</button>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <input type="text" className="px-3 py-1 rounded text-black text-sm" placeholder="Search..." />
            <button className="text-sm hover:text-purple-200">Log out</button>
          </div>
        </div>
        
        <div className="px-4 py-3 border-t border-purple-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white rounded overflow-hidden">
                <img src="/api/placeholder/48/48" alt="Patient" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Jake MEDLOCK</h1>
                <div className="text-purple-200 text-sm">
                  69yo M 12-12-1949 #133199 E#133199 
                  <span className="bg-orange-500 text-white px-2 py-1 rounded text-xs ml-2">AT RISK</span>
                </div>
              </div>
            </div>
            
            {/* Test Case Selector */}
            <div className="flex items-center space-x-2">
              <label className="text-purple-200 text-sm font-medium">Test Case:</label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    background: 'white',
                    color: '#4B5563',
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #a78bfa',
                    minWidth: 220,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedFolders((prev) => ({ ...prev, __dropdown: !prev.__dropdown }))}
                >
                  {selectedTestCase
                    ? (testCases.find((tc) => tc.id === selectedTestCase)?.name || 'Select a test case...')
                    : 'Select a test case...'}
                </div>
                {expandedFolders.__dropdown && testCaseTree && (
                  <div
                    style={{
                      position: 'absolute',
                      zIndex: 10,
                      background: '#f8fafc',
                      border: '1px solid #a78bfa',
                      borderRadius: 8,
                      marginTop: 2,
                      boxShadow: '0 2px 12px rgba(109,40,217,0.08)',
                      maxHeight: 340,
                      minWidth: 260,
                      maxWidth: 'calc(100vw - 32px)',
                      overflowY: 'auto',
                      overflowX: 'auto',
                      right: 0,
                      left: 'auto',
                      padding: 4,
                    }}
                  >
                    <TreeDropdown
                      tree={testCaseTree}
                      expanded={expandedFolders}
                      onToggle={(folderPath) =>
                        setExpandedFolders((prev) => ({ ...prev, [folderPath]: !prev[folderPath] }))
                      }
                      onSelect={(fileId) => {
                        setSelectedTestCase(fileId);
                        setExpandedFolders((prev) => ({ ...prev, __dropdown: false }));
                        loadTestCase(fileId);
                      }}
                      selectedFile={selectedTestCase}
                    />
                  </div>
                )}
              </div>
              {loadingTestCase && <div className="text-purple-200 text-sm">Loading...</div>}
            </div>
          </div>
          
          <div className="mt-2 text-sm text-purple-200">
            ✓ Check-in → ✓ Intake → ✓ Exam → ✓ Sign-off → ✓ Checkout
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 py-2 flex space-x-6">
          <button className="px-4 py-2 text-purple-600 border-b-2 border-purple-600 font-medium">Registration</button>
          <button className="px-4 py-2 text-gray-600 hover:text-purple-600">Messaging</button>
          <button className="px-4 py-2 text-gray-600 hover:text-purple-600">Scheduling</button>
          <button className="px-4 py-2 text-gray-600 hover:text-purple-600">Billing</button>
          <button className="px-4 py-2 text-gray-600 hover:text-purple-600">Clinicals</button>
          <button className="px-4 py-2 text-gray-600 hover:text-purple-600">Communicator</button>
          <button className="px-4 py-2 text-gray-600 hover:text-purple-600">Other</button>
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Checkout Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Checkout</h2>
          <div className="flex space-x-2">
            <button className="bg-white border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Patient
            </button>
            <button className="bg-gray-100 border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
              Claim: Billing
            </button>
          </div>
          <div className="mt-4">
            <button className="text-blue-600 hover:text-blue-800 text-sm bg-transparent border-none">Show full encounter summary</button>
          </div>
        </div>

        {/* Appointment Summary */}
        <div className="bg-white border border-gray-200 rounded mb-6">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h3 className="font-medium text-gray-800">Appointment Summary</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <div className="flex">
                  <div className="w-32 text-sm text-gray-600">Patient</div>
                  <div className="text-sm">MEDLOCK, JAKE (69, M) ID# 133199</div>
                </div>
                <div className="flex">
                  <div className="w-32 text-sm text-gray-600">Provider</div>
                  <div className="text-sm">MCKENZIE LEFTWICH, MD</div>
                </div>
                <div className="flex">
                  <div className="w-32 text-sm text-gray-600">Service Department</div>
                  <div className="text-sm">HVMC - Internal Medicine - Main Campus</div>
                </div>
                <div className="flex">
                  <div className="w-32 text-sm text-gray-600">Insurance</div>
                  <div className="text-sm">
                    <div>Med Primary: AETNA (POS II)</div>
                    <div>Insurance #: 12345678</div>
                    <div>Med Secondary: No Insurance/Self Pay</div>
                    <div>Prescription: The payer is currently unavailable, Please try again later. 
                      <button className="text-blue-600 hover:text-blue-800 bg-transparent border-none">details</button>
                    </div>
                    <div><button className="text-blue-600 hover:text-blue-800 bg-transparent border-none">check again</button></div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex">
                  <div className="w-32 text-sm text-gray-600">Appt. Date/Time</div>
                  <div className="text-sm">03/28/2019 09:30AM</div>
                </div>
                <div className="flex">
                  <div className="w-32 text-sm text-gray-600">Appt. Type</div>
                  <div className="text-sm">Follow-up</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Diagnoses */}
        <div className="bg-white border border-gray-200 rounded mb-6">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h3 className="font-medium text-gray-800">Diagnoses</h3>
          </div>
          <div className="p-4">
            <textarea
              id="diagnosis-textarea"
              placeholder="Enter diagnosis notes here..."
              value={diagnosisText}
              onChange={(e) => setDiagnosisText(e.target.value)}
              className={`w-full border border-gray-300 rounded px-3 py-2 text-sm h-32 resize-none ${
                highlightedElement === 'diagnosis-textarea' ? 'ring-4 ring-yellow-400 ring-opacity-50 bg-yellow-50' : ''
              }`}
            />
          </div>
        </div>



        {/* Services */}
        <div className="bg-white border border-gray-200 rounded mb-6">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-medium text-gray-800">Services</h3>
            <div className="flex items-center space-x-4 text-sm">
              <button className="text-blue-600 hover:text-blue-800 bg-transparent border-none">Apply all ICD-10 codes to all services</button>
              <button className="text-blue-600 hover:text-blue-800 bg-transparent border-none">Print</button>
            </div>
          </div>
          
          {/* E&M Section */}
          <div className="p-4">
            <div className="bg-purple-50 border border-purple-200 rounded">
              <div className="bg-purple-100 px-4 py-2 border-b border-purple-200">
                <h4 className="font-medium text-purple-800">E&M</h4>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-7 gap-4 text-sm">
                  <div className="font-medium text-gray-700">Procedure Code</div>
                  <div className="font-medium text-gray-700 col-span-2">Code Description</div>
                  <div className="font-medium text-gray-700">Modifiers<br/><span className="text-gray-500">(Non Fee-Affecting)</span></div>
                  <div className="font-medium text-gray-700">Units</div>
                  <div className="font-medium text-gray-700">ICD-10 Codes</div>
                  <div className="font-medium text-green-700 text-center">Bill?</div>
                </div>
                <div className="grid grid-cols-7 gap-4 mt-4 items-start">
                  <div className="flex items-center space-x-2">
                    <input
                      id="em-code-input"
                      type="text"
                      value={emCode.code}
                      onChange={(e) => setEmCode({...emCode, code: e.target.value})}
                      className={`border border-gray-300 rounded px-2 py-1 text-sm w-full ${
                        highlightedElement === 'em-code-input' ? 'ring-4 ring-yellow-400 ring-opacity-50 bg-yellow-50' : ''
                      }`}
                      data-field="em-code"
                    />
                    <HelpCircle size={16} className="text-gray-400" />
                  </div>
                  <div className="col-span-2 flex items-center space-x-2">
                    <input
                      type="text"
                      value={emCode.description}
                      onChange={(e) => setEmCode({...emCode, description: e.target.value})}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                      data-field="em-description"
                    />
                    <HelpCircle size={16} className="text-gray-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      id="em-modifiers-input"
                      type="text"
                      value={emCode.modifiers}
                      onChange={(e) => setEmCode({...emCode, modifiers: e.target.value})}
                      className={`border border-gray-300 rounded px-2 py-1 text-sm w-full ${
                        highlightedElement === 'em-modifiers-input' ? 'ring-4 ring-yellow-400 ring-opacity-50 bg-yellow-50' : ''
                      }`}
                      placeholder=""
                    />
                    <HelpCircle size={16} className="text-gray-400" />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={emCode.units}
                      onChange={(e) => setEmCode({...emCode, units: e.target.value})}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                    />
                  </div>
                  <div id="icd-codes-section">
                    <div className={`space-y-2 max-w-sm ${
                      highlightedElement === 'icd-codes-section' ? 'ring-4 ring-yellow-400 ring-opacity-50 bg-yellow-50 p-2 rounded' : ''
                    }`}>
                      {emCode.code &&
                        icdCodes.map((item, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <span className="font-mono text-xs bg-blue-100 px-2 py-1 rounded">{item.code}</span>
                            <button 
                              onClick={() => removeIcdCode(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))
                      }
                      
                      <div className="space-y-2 mt-2">
                        <div className="flex space-x-1">
                          <input
                            type="text"
                            placeholder="Code"
                            value={newIcdCode}
                            onChange={(e) => setNewIcdCode(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-16"
                          />
                          <button
                            onClick={() => {
                              if (newIcdCode && newIcdDescription) {
                                setIcdCodes([...icdCodes, { code: newIcdCode, description: newIcdDescription }]);
                                setNewIcdCode('');
                                setNewIcdDescription('');
                              }
                            }}
                            className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                          >
                            Add
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Description"
                          value={newIcdDescription}
                          onChange={(e) => setNewIcdDescription(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-full"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <label className="flex items-center text-green-700">
                      <input
                        type="checkbox"
                        checked={emBillChecked}
                        onChange={e => setEmBillChecked(e.target.checked)}
                        className="w-5 h-5 accent-green-600 border-green-400 rounded focus:ring-green-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Added Miscellaneous Services */}
          {addedMiscServices.map((service, serviceIndex) => (
            <div key={serviceIndex} className="bg-purple-50 border border-purple-200 rounded mt-4">
              <div className="bg-purple-100 px-4 py-2 border-b border-purple-200 flex justify-between items-center">
                <h4 className="font-medium text-purple-800">Miscellaneous Service</h4>
                <button 
                  onClick={() => removeMiscService(serviceIndex)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-7 gap-4 text-sm">
                  <div className="font-medium text-gray-700">Procedure Code</div>
                  <div className="font-medium text-gray-700 col-span-2">Code Description</div>
                  <div className="font-medium text-gray-700">Modifiers<br/><span className="text-gray-500">(Non Fee-Affecting)</span></div>
                  <div className="font-medium text-gray-700">Units</div>
                  <div className="font-medium text-gray-700">ICD-10 Codes</div>
                  <div className="font-medium text-green-700 text-center">Bill?</div>
                </div>
                <div className="grid grid-cols-7 gap-4 mt-4 items-start">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={service.code}
                      onChange={(e) => updateMiscService(serviceIndex, 'code', e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                    />
                    <HelpCircle size={16} className="text-gray-400" />
                  </div>
                  <div className="col-span-2 flex items-center space-x-2">
                    <input
                      type="text"
                      value={service.description}
                      onChange={(e) => updateMiscService(serviceIndex, 'description', e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                      placeholder="Enter description"
                    />
                    <HelpCircle size={16} className="text-gray-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={service.modifiers}
                      onChange={(e) => updateMiscService(serviceIndex, 'modifiers', e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                      placeholder=""
                    />
                    <HelpCircle size={16} className="text-gray-400" />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={service.units}
                      onChange={(e) => updateMiscService(serviceIndex, 'units', e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                    />
                  </div>
                  <div>
                    <div className="space-y-2 max-w-sm">
                      {service.icd10Codes.map((icd, icdIndex) => (
                        <div key={icdIndex} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="font-mono text-xs bg-blue-100 px-2 py-1 rounded">{icd.code}</span>
                          <button 
                            onClick={() => removeIcdFromMiscService(serviceIndex, icdIndex)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="space-y-2 mt-2">
                        <div className="flex space-x-1">
                          <input
                            type="text"
                            placeholder="Code"
                            value={newIcdCode}
                            onChange={(e) => setNewIcdCode(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-16"
                          />
                          <button
                            onClick={() => addIcdToMiscService(serviceIndex)}
                            className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                          >
                            Add
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Description"
                          value={newIcdDescription}
                          onChange={(e) => setNewIcdDescription(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-xs w-full"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <label className="flex items-center text-green-700">
                      <input
                        type="checkbox"
                        checked={service.billChecked}
                        onChange={e => updateMiscService(serviceIndex, 'billChecked', e.target.checked)}
                        className="w-5 h-5 accent-green-600 border-green-400 rounded focus:ring-green-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Miscellaneous Section */}
          <div className="p-4 border-t border-gray-200">
            <div className="bg-purple-50 border border-purple-200 rounded">
              <div className="bg-purple-100 px-4 py-2 border-b border-purple-200">
                <h4 className="font-medium text-purple-800">Miscellaneous</h4>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h5 className="font-medium text-gray-700 mb-2">Add Service</h5>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        placeholder="Add miscellaneous code"
                        value={newIcdCode}
                        onChange={(e) => setNewIcdCode(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
                      />
                      <button
                        onClick={addMiscService}
                        className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-200 rounded mb-6">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-medium text-gray-800">Notes</h3>
            <button className="text-blue-600 hover:text-blue-800 text-sm bg-transparent border-none">Audit history</button>
          </div>
          <div className="p-4">
            <textarea
              placeholder="Add notes here..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm h-24 resize-none"
            />
          </div>
        </div>

        {/* Provider Review */}
        <div className="bg-white border border-gray-200 rounded mb-6">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h3 className="font-medium text-gray-800">Provider Review</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span>Billing Tab Review Complete (kmcauliffe2, 03/28/2019 12:42 PM)</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            <button className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700">
              Done with Checkout
            </button>
            <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
              Save
            </button>
            <button className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
              Save & Enter Charges
            </button>
          </div>
          <div className="text-sm text-gray-500">
            HVMC - Internal Medicine - Main Campus
          </div>
        </div>
        <div className="bg-gray-200 px-4 py-2 text-sm text-gray-600 border-t mt-auto">
          No Mailbox
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-200 px-4 py-2 text-sm text-gray-600 border-t">
        No Mailbox
      </div>
      </div>

      {/* AI Agent Extension - Simulated Extension Overlay */}
      <div className="w-96 bg-white border-l border-gray-300 shadow-lg flex flex-col">
        {/* Agent Controls */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <Bot className="w-6 h-6 mr-3 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-800">AI Agent Extension</h3>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                Step {agentState.currentStep} of {agentState.totalSteps}
              </span>
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: agentState.totalSteps > 0 ? `${(agentState.currentStep / agentState.totalSteps) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={runAgent}
              disabled={agentState.isRunning}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
            >
              <Play className="w-4 h-4 mr-2" />
              {agentState.isRunning ? 'Running...' : 'Start Agent'}
            </button>
            
            {agentState.isRunning && (
              <button
                onClick={pauseAgent}
                className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                {agentState.isPaused ? (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={stopAgent}
              disabled={!agentState.isRunning}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </button>
          </div>
          
          <div className="mt-2 text-sm text-gray-600">
            {selectedTestCase === 'telehealth-visit' ? 'Test Case 1: Telehealth - Missing Modifier 95' : 'Test Case 2: Obesity - Primary Diagnosis Fix'}
          </div>
        </div>

        {/* Decision Logging */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <Bot className="w-5 h-5 mr-2" />
                Agent Decision Log
              </h3>
              <button
                onClick={() => setAgentLogs([])}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear Log
              </button>
            </div>
          </div>
          
          <div className="p-4 space-y-3">
            {agentLogs.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Bot className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No agent actions yet</p>
                <p className="text-xs">Start the agent to see decision logs</p>
              </div>
            ) : (
              agentLogs.map((log) => (
                <div
                  key={log.id}
                  className={`agent-log p-3 rounded-lg ${
                    log.confidence >= 0.8 
                      ? 'agent-log-high-confidence' 
                      : log.confidence >= 0.6 
                      ? 'agent-log-medium-confidence' 
                      : 'agent-log-low-confidence'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs font-medium text-gray-600">
                      Step {log.step + 1} • {log.timestamp}
                    </div>
                    <div className="text-xs text-gray-500">
                      {Math.round(log.confidence * 100)}% confidence
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-800 mb-1">
                    {log.action}
                  </div>
                  <div className="text-xs text-gray-600">
                    {log.reasoning}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
