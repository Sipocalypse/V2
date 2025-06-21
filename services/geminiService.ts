
import { GeneratedGame } from '../types';

const GAME_GENERATOR_WEBHOOK_URL = 'https://hook.eu2.make.com/8ym052altan60ddmeki1zl2160f1ghxr';

interface GameGenerationParams {
  activity: string;
  chaosLevel: number; // Expect number here
  includeDares: boolean;
  numberOfRules: number;
}

export const generateGameWithGemini = async (params: GameGenerationParams): Promise<GeneratedGame> => {
  if (!params.activity || params.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  let response: Response;
  try {
    console.log("Sending to webhook. Payload:", JSON.stringify(params));
    response = await fetch(GAME_GENERATOR_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
  } catch (networkError: any) {
    console.error("Network error calling webhook:", networkError);
    throw new Error(`Failed to connect to the game generator: ${networkError.message}. Please check your internet connection.`);
  }

  if (!response.ok) {
    let errorDetails = `Webhook request failed with status: ${response.status}`;
    try {
      const errorText = await response.text();
      if (errorText) {
        errorDetails += ` - ${errorText}`;
      }
    } catch (e) {
      // Ignore error from parsing response text if response is not ok
    }
    console.error(errorDetails);
    throw new Error(errorDetails);
  }

  const responseText = await response.text();
  let generatedGame: GeneratedGame | null = null;

  // Attempt to parse as JSON first
  try {
    const parsedJson = JSON.parse(responseText);
    if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.rules)) {
      generatedGame = parsedJson as GeneratedGame;
    } else {
        console.warn("Parsed JSON, but it does not match expected GeneratedGame structure:", parsedJson);
    }
  } catch (parseError: any) {
    console.log("Failed to parse JSON response from webhook. Will attempt plain text parsing. Error:", parseError.message);
    const trimmedResponseText = responseText.trim().toLowerCase();
    if (trimmedResponseText === "accepted") {
      console.error("Webhook returned 'Accepted' instead of game data.");
      throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
    }

    // Advanced plain text parsing
    const rawLines = responseText.split('\n');
    const titleParts: string[] = [];
    const ruleLines: string[] = [];
    let foundFirstRule = false;

    const rulePattern = /^\s*(\d+)\.\s*(.+)/; 
    const inlineRulePattern = /(.*?)(\b\d+\.\s*.+)/; 

    for (const rawLine of rawLines) {
      const currentLine = rawLine.trim();
      if (currentLine.length === 0) continue;

      if (foundFirstRule) {
        const match = currentLine.match(rulePattern);
        if (match && typeof match[2] === 'string') {
          ruleLines.push(match[2].trim());
        } else if (match) {
            console.warn("Rule pattern matched within rules block, but capture group 2 is not a string:", currentLine, match);
             // Optionally, attempt to use match[0] or part of it if appropriate, or just skip
        } else {
           console.warn("Non-rule line found within rules block (or malformed rule):", currentLine);
        }
      } else {
        const startsWithRuleMatch = currentLine.match(rulePattern);
        if (startsWithRuleMatch && typeof startsWithRuleMatch[2] === 'string') {
          foundFirstRule = true;
          ruleLines.push(startsWithRuleMatch[2].trim());
        } else if (startsWithRuleMatch) {
            console.warn("startsWithRuleMatch pattern matched, but capture group 2 is not a string:", currentLine, startsWithRuleMatch);
            titleParts.push(currentLine); // Treat as title if rule part is malformed
        } else {
          const inlineMatch = currentLine.match(inlineRulePattern);
          if (inlineMatch && typeof inlineMatch[1] === 'string' && typeof inlineMatch[2] === 'string') {
            const titleCandidate = inlineMatch[1].trim();
            const ruleFullText = inlineMatch[2].trim();

            if (titleCandidate.length > 0) {
              titleParts.push(titleCandidate);
            }

            const firstRuleContentMatch = ruleFullText.match(rulePattern);
            if (firstRuleContentMatch && typeof firstRuleContentMatch[2] === 'string') {
              ruleLines.push(firstRuleContentMatch[2].trim());
              foundFirstRule = true;
            } else {
              titleParts.push(currentLine); 
              console.warn("Malformed inline rule content, treating original line as title:", currentLine);
            }
          } else if (inlineMatch) {
              titleParts.push(currentLine);
              console.warn("Inline pattern matched but capture groups are not as expected (e.g. not strings), treating as title:", currentLine, inlineMatch);
          } else {
            titleParts.push(currentLine);
          }
        }
      }
    }

    if (ruleLines.length > 0) {
      let gameTitle: string;
      const potentialTitle = titleParts.join(' ').trim();

      if (potentialTitle.length > 0) {
        gameTitle = potentialTitle;
      } else {
        console.warn("Webhook returned plain text rules without a clear title. Generating title based on activity.");
        gameTitle = `Sipocalypse Game for '${params.activity}'`;
        if (gameTitle.length > 70) { 
          gameTitle = `Sipocalypse Game for '${params.activity.substring(0, 30)}...'`;
        }
        if (params.activity.trim() === "") {
          gameTitle = "Generated Sipocalypse Game";
        }
      }
      
      generatedGame = {
        title: gameTitle,
        rules: ruleLines,
        dares: [], 
      };
      console.log("Constructed game object from plain text:", generatedGame);
      
      if (params.includeDares) {
        console.warn("Dares were requested, but the webhook returned a plain text list of rules. Dares section will be empty. For dares, the webhook should return structured JSON.");
      }
    } else if (titleParts.join('').trim().length > 0) {
        console.warn(`Plain text response had a potential title "${titleParts.join(' ')}" but no parsable rules found. Discarding.`);
    }
  }

  if (!generatedGame) {
    console.error("Could not parse game from webhook response:", responseText.substring(0, 200));
    throw new Error(`The game generator returned an unparsable format. Response snippet: ${responseText.substring(0, 150)}...`);
  }

  if (!generatedGame.title || !Array.isArray(generatedGame.rules) || generatedGame.rules.length === 0) {
    console.error("Parsed/constructed game is missing essential fields or has no rules:", generatedGame);
    throw new Error("The game generator returned an incomplete game structure. Try adjusting your options or rephrasing the activity.");
  }

  if (params.includeDares) {
    if (!Array.isArray(generatedGame.dares)) {
      console.warn("Dares were requested, but 'dares' field was not a valid array in the response. Defaulting to empty dares list.");
      generatedGame.dares = [];
    }
  } else {
    generatedGame.dares = [];
  }
  
  return generatedGame;
};
