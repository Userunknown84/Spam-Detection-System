import React, {useState, useEffect} from 'react';
import './OnboardingTour.jsx';
const steps = [
  {
    id: 'welcome',
    title: '👋 Welcome to Spam Detection!',
    description: 'Let\'s take a quick tour of the main features.',
    target: 'body'
  },
  {
    id: 'predict',
    title: '🔍 Predict Spam',
    description: 'Enter any text or email to check if it\'s spam.',
    target: '.predict-input'
  },
  {
    id: 'dashboard',
    title: '📊 Dashboard',
    description: 'View your stats, trends, and recent activity.',
    target: '.dashboard-tab'
  },
  {
    id: 'history',
    title: '📜 History',
    description: 'See all your past predictions.',
    target: '.history-tab'
  },
  {
    id: 'insights',
    title: '📈 Insights',
    description: 'Get detailed analytics and spam patterns.',
    target: '.insights-tab'
  },
  {
    id: 'done',
    title: '🎉 You\'re Ready!',
    description: 'Start detecting spam and keep your inbox safe.',
    target: 'body'
  }
];

export function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('onboardingSeen');
    if (!hasSeenTour) {
      setIsOpen(true);
    }
  }, []);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTour = () => {
    setIsOpen(false);
    localStorage.setItem('onboardingSeen', 'true');
  };

  const step = steps[currentStep];

  if (!isOpen) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-step">
          <div className="step-indicators">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`step-dot ${i === currentStep ? 'active' : ''}`}
              />
            ))}
          </div>

          <h2 className="step-title">{step.title}</h2>
          <p className="step-description">{step.description}</p>

          <div className="step-actions">
            <button
              className="step-btn skip"
              onClick={completeTour}
            >
              Skip
            </button>
            {currentStep > 0 && (
              <button
                className="step-btn prev"
                onClick={prevStep}
              >
                Back
              </button>
            )}
            <button
              className="step-btn next"
              onClick={nextStep}
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}