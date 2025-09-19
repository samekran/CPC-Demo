# CPC Demo - AI Billing Assistant with Agentic AI

A React-based demo showcasing an AI agent that can automatically fix common medical billing issues in an EMR system.

## Features

- **Agentic AI Demo**: Watch an AI agent automatically fix billing issues
- **Two Test Cases**:
  1. **Telehealth Visit**: Adds missing modifier 95 to CPT codes
  2. **Obesity Diagnosis**: Reorders diagnosis codes to put obesity as secondary
- **Visual Agent Interaction**: See the agent's cursor move and highlight form fields
- **Decision Logging**: Real-time log of agent decisions and reasoning
- **Interactive Controls**: Play, pause, and stop the agent

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Development Server**:
   ```bash
   npm start
   ```

3. **Open in Browser**:
   The app will open at `http://localhost:3000`

## How to Use

1. **Select a Test Case**: Choose between the two test cases from the dropdown
2. **Start the Agent**: Click "Start Agent" to begin the automated fix
3. **Watch the Agent**: Observe the cursor movement and form field highlighting
4. **Monitor Decisions**: Check the decision log sidebar for detailed reasoning
5. **Control the Agent**: Use pause/resume and stop buttons as needed

## Test Cases

### Test Case 1: Telehealth - Missing Modifier 95
- **Issue**: Telehealth visit missing required modifier 95 on CPT codes
- **Agent Action**: Adds modifier 95 to both E/M code (99213) and venipuncture code (36415)
- **Confidence**: High (95-100%)

### Test Case 2: Obesity - Primary Diagnosis Fix
- **Issue**: Obesity incorrectly listed as primary diagnosis
- **Agent Action**: Reorders diagnosis codes to put diabetes as primary, obesity as secondary
- **Confidence**: High (90-100%)

## Technology Stack

- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Custom CSS animations** for agent cursor and highlights

## Project Structure

```
src/
├── App.tsx          # Main component with agent logic
├── index.tsx        # React entry point
└── index.css        # Tailwind CSS and custom styles
```

## Agent Features

- **Animated Cursor**: Blue pulsing cursor that moves to form elements
- **Field Highlighting**: Yellow highlight animation on targeted form fields
- **Step-by-Step Logging**: Detailed log of each agent action with confidence scores
- **Real-time Updates**: Form data updates as the agent makes changes
- **Interrupt Capability**: Users can pause, resume, or stop the agent at any time
