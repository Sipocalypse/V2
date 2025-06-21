
import { GoogleGenAI } from "@google/genai";
// import { GameOptions, GeneratedGame } from '../types.js'; // Types are erased
import { API_MODEL_NAME } from '../constants.js';

const constructPrompt = (options) => {
  let prompt = `Generate a creative and fun drinking game titled based on the activity: "${options.activity}".\n`;
  prompt += `The game should have exactly ${options.numberOfRules} rules.\n`;
  prompt += `The chaos level should be: "${options.chaosLevel}". Examples for chaos levels are "Initial Sips", "Rising Revelry", "Pre-Apocalyptic Party", or "Sipocalypse Level Event".\n`;
  
  if (options.includeDares) {
    prompt += `Include a section with 3-5 example dares relevant to the activity and chaos level.\n`;
  } else {
    prompt += `Do not include any dares.\n`;
  }

  prompt += `The output should be a JSON object with the following structure:
{
  "title": "Clear and Engaging Game Title",
  "rules": ["Rule 1 text...", "Rule 2 text...", ...],
  "dares": ["Dare 1 text...", "Dare 2 text...", ...]
}
If dares are not requested, the "dares" array should be empty.
The title should be catchy and related to the activity.
The rules should be clear, concise, and easy to follow.
The rules and dares should be directly related to the specified activity and chaos level.
Ensure the number of rules matches exactly ${options.numberOfRules}.
Do not wrap the JSON in markdown code fences.
`;
  return prompt;
};

export const generateGameWithGemini = async (options) => {
  if (!process.env.API_KEY) {
    console.error("API_KEY is not configured.");
    throw new Error("Game generation service is not configured (API key missing). Please contact support.");
  }
  if (!options.activity || options.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = constructPrompt(options);

  try {
    const response = await ai.models.generateContent({
      model: API_MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^\`\`\`(\w*)?\s*\n?(.*?)\n?\s*\`\`\`$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    
    console.log("Raw JSON string from AI:", jsonStr);
    
    const generatedGame = JSON.parse(jsonStr);

    if (!generatedGame.title || !Array.isArray(generatedGame.rules) || generatedGame.rules.length === 0) {
      console.error("Parsed JSON does not match expected GeneratedGame structure or is missing essential fields:", generatedGame);
      throw new Error("The AI returned an unexpected game format. The game might not be related to your activity or is incomplete. Try adjusting your options or rephrasing the activity.");
    }

    if (options.includeDares) {
      if (!Array.isArray(generatedGame.dares)) {
        generatedGame.dares = []; 
      }
    } else {
      generatedGame.dares = [];
    }
    
    return generatedGame;

  } catch (error) {
    console.error("Error generating game with Gemini:", error);
    if (error.message.includes("JSON.parse")) {
        throw new Error("The AI returned an invalid game format (not valid JSON). Please try again, or adjust your activity description as it might be confusing the AI.");
    }
    if (error.status && error.status >= 400 && error.status < 500) {
      throw new Error(`AI service error: ${error.message}. Please check your input or API configuration.`);
    }
    if (error.status && error.status >= 500) {
      throw new Error(`AI service is temporarily unavailable: ${error.message}. Please try again later.`);
    }
    throw new Error(error.message || "An unknown error occurred while generating the game with AI. Please try again.");
  }
};
