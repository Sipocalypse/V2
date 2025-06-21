
import React, { useState, useCallback, useEffect } from 'react';
// import { GameOptions, GeneratedGame } from '../types.js'; // Types are erased
import { CHAOS_LEVELS, MIN_RULES, MAX_RULES, DEFAULT_RULES } from '../constants.js'; 
import { generateGameWithGemini } from '../services/geminiService.js';
import GameDisplay from './GameDisplay.js';
import Button from './Button.js';
import SelectInput from './SelectInput.js';
import CheckboxInput from './CheckboxInput.js';
import TextInput from './TextInput.js';
import SliderInput from './SliderInput.js';

const COCKTAIL_WEBHOOK_URL = 'https://hook.eu2.make.com/1jjo6upxzff3gryjehqi15h969mrdhvx';

const GameGenerator = () => {
  const [options, setOptions] = useState({
    activity: '',
    chaosLevel: CHAOS_LEVELS[0], 
    includeDares: false,
    numberOfRules: DEFAULT_RULES,
  });
  const [generatedGame, setGeneratedGame] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [cocktailEmail, setCocktailEmail] = useState('');
  const [cocktailSubmissionStatus, setCocktailSubmissionStatus] = useState('idle');
  const [cocktailSubmissionError, setCocktailSubmissionError] = useState(null);

  const resetCocktailForm = useCallback(() => {
    setCocktailEmail('');
    setCocktailSubmissionStatus('idle');
    setCocktailSubmissionError(null);
  }, []);

  const handleInputChange = useCallback((field, value) => {
    setOptions(prev => ({ 
      ...prev, 
      [field]: field === 'numberOfRules' ? Number(value) : value 
    }));
    if (generatedGame) {
        setGeneratedGame(null); 
        resetCocktailForm();
    }
    setError(null);
  }, [generatedGame, resetCocktailForm]);

  const handleGenerateGame = useCallback(async () => {
    if (!options.activity.trim()) {
      setError("Please tell us what you're doing!");
      return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedGame(null);
    resetCocktailForm();
    try {
      const game = await generateGameWithGemini(options);
      setGeneratedGame(game);
    } catch (err) {
      console.error("Error generating game with Gemini:", err);
      setError(err.message || 'Failed to generate game with AI. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [options, resetCocktailForm]);

  const handleActivityKeyDown = (event) => {
    if (event.key === 'Enter' && options.activity.trim() && !isLoading) {
      event.preventDefault();
      handleGenerateGame();
    }
  };

  const sendCocktailRequestToWebhook = async (activity, email) => {
    const payload = { activity, email };
    const response = await fetch(COCKTAIL_WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        let errorDetails = `Webhook request failed with status: ${response.status}`;
        try {
            const errorText = await response.text();
            if (errorText) {
                errorDetails += ` - ${errorText}`;
            }
        } catch (e) { /* Ignore */ }
        throw new Error(errorDetails);
    }
    console.log('Webhook response:', await response.text()); 
  };

  const handleCocktailEmailChange = (e) => {
    setCocktailEmail(e.target.value);
    if (cocktailSubmissionStatus === 'error' || cocktailSubmissionStatus === 'success') {
        setCocktailSubmissionStatus('idle'); 
        setCocktailSubmissionError(null);
    }
  };

  const handleCocktailSubmit = async () => {
    if (!cocktailEmail.trim() || !/\S+@\S+\.\S+/.test(cocktailEmail)) {
        setCocktailSubmissionError('Please enter a valid email address.');
        setCocktailSubmissionStatus('error');
        return;
    }
    setCocktailSubmissionStatus('submitting');
    setCocktailSubmissionError(null);
    try {
        await sendCocktailRequestToWebhook(options.activity, cocktailEmail);
        setCocktailSubmissionStatus('success');
    } catch (err) {
        console.error("Error sending cocktail request:", err);
        setCocktailSubmissionError(err.message || 'Failed to send cocktail recipe request. Please try again.');
        setCocktailSubmissionStatus('error');
    }
  };

  return (
    React.createElement("div", { className: "max-w-3xl mx-auto p-6 md:p-8 bg-gray-900/60 rounded-xl shadow-2xl shadow-purple-500/10" },
      React.createElement("h2", { className: "text-4xl font-luckiest text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-500 text-transparent bg-clip-text" },
        "Game Generator"
      ),
      React.createElement("div", { className: "space-y-6 mb-8" },
        React.createElement(TextInput, {
          id: "activity",
          label: "What are you doing?",
          value: options.activity,
          onChange: (e) => handleInputChange('activity', e.target.value),
          placeholder: "e.g., At a funeral, In the gym, During a boring meeting",
          disabled: isLoading,
          onKeyDown: handleActivityKeyDown
        }),
        React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6" },
          React.createElement(SelectInput, {
            id: "chaosLevel", 
            label: "Chaos Level", 
            value: options.chaosLevel, 
            onChange: (e) => handleInputChange('chaosLevel', e.target.value), 
            options: CHAOS_LEVELS, 
            disabled: isLoading
          }),
          React.createElement(SliderInput, {
            id: "numberOfRules",
            label: "Number of Rules",
            value: options.numberOfRules,
            onChange: (e) => handleInputChange('numberOfRules', parseInt(e.target.value, 10)),
            min: MIN_RULES,
            max: MAX_RULES,
            disabled: isLoading,
            unitLabel: "rules"
          })
        ),
        React.createElement("div", { className: "pt-2" }, 
            React.createElement(CheckboxInput, {
            id: "includeDares",
            label: "Include Dares?",
            checked: options.includeDares,
            onChange: (e) => handleInputChange('includeDares', e.target.checked),
            disabled: isLoading
            })
        )
      ),
      React.createElement(Button, {
        onClick: handleGenerateGame,
        disabled: isLoading || !options.activity.trim(),
        isLoading: isLoading,
        variant: "primary",
        size: "lg", 
        className: "w-full text-lg py-3.5 font-semibold",
        title: !options.activity.trim() ? "Please enter what you're doing first" : undefined
      },
      isLoading ? 'Summoning Chaos...' : 'Begin the Sipocalypse!'
      ),
      error && (
        React.createElement("div", { className: "mt-6 p-4 bg-red-500/20 text-red-400 border border-red-500 rounded-md", role: "alert" },
          React.createElement("p", { className: "font-semibold" }, "Oops! Something went wrong."),
          React.createElement("p", { className: "text-sm" }, error)
        )
      ),
      generatedGame && !isLoading && (
        React.createElement(React.Fragment, null,
          React.createElement("div", { className: "mt-10" },
            React.createElement(GameDisplay, { game: generatedGame })
          ),
          React.createElement("div", { className: "mt-10 p-6 bg-gray-800 rounded-lg shadow-md border border-gray-700/80" },
            React.createElement("h4", { className: "text-xl font-semibold text-center mb-4 text-purple-300" },
              "Want a custom chaos cocktail recipe designed for your activity?"
            ),
            React.createElement("div", { className: "space-y-4" },
              React.createElement(TextInput, {
                id: "cocktailEmail",
                label: "Your Email Address",
                type: "email",
                value: cocktailEmail,
                onChange: handleCocktailEmailChange,
                placeholder: "e.g., partyanimal@example.com",
                disabled: cocktailSubmissionStatus === 'submitting'
              }),
              React.createElement(Button, {
                onClick: handleCocktailSubmit,
                disabled: cocktailSubmissionStatus === 'submitting' || !cocktailEmail.trim() || cocktailSubmissionStatus === 'success',
                isLoading: cocktailSubmissionStatus === 'submitting',
                variant: "secondary",
                className: "w-full text-md py-2.5 font-medium"
              },
              cocktailSubmissionStatus === 'submitting' ? 'Sending Request...' : 
              cocktailSubmissionStatus === 'success' ? 'Request Sent!' : 'Get My Cocktail Recipe!'
              ),
              React.createElement("p", {className: "text-xs text-gray-400 mt-3 text-center"},
                "By entering your email, you agree to receive occasional updates and marketing emails from Sipocalypse. You can unsubscribe at any time. Read our ",
                React.createElement("a", {href: "/#/privacy", className: "text-purple-300 hover:text-purple-200 underline"}, "Privacy Policy"),
                "."
              ),
              cocktailSubmissionStatus === 'success' && (
                React.createElement("p", { className: "text-green-400 text-sm text-center animate-pulse mt-2" },
                  "Request sent! Keep an eye on your inbox (and maybe your spam folder, just in case!)."
                )
              ),
              cocktailSubmissionStatus === 'error' && cocktailSubmissionError && (
                React.createElement("p", { className: "text-red-400 text-sm text-center mt-2", role: "alert" },
                  cocktailSubmissionError
                )
              )
            )
          )
        )
      )
    )
  );
};

export default GameGenerator;
