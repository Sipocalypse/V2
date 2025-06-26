
// Helper to escape special characters for regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const GAME_GENERATOR_WEBHOOK_URL = 'https://hook.eu2.make.com/8ym052altan60ddmeki1zl2160f1ghxr';
const DARE_SEPARATOR_KEYWORD = "###";

// Cleans rule/dare lines: removes leading numbering (e.g., "1. "), trims, and filters empty.
const cleanAndDeduplicatePotentialRules = (lines) => {
  if (!Array.isArray(lines)) return [];
  return lines
    .map(line => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean); // filter(Boolean) removes empty strings
};

export const generateGameViaWebhook = async (params) => {
  if (!params.activity || params.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  try {
    let response;
    try {
      response = await fetch(GAME_GENERATOR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch (networkError) {
      console.error("Network error calling webhook:", networkError);
      throw new Error(`Failed to connect to the game generator: ${networkError.message || 'Check your internet connection.'}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Could not read error body.');
      throw new Error(`Webhook request failed with status: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log("Webhook Raw Response Text:", responseText);

    let finalTitle;
    let finalRules;
    let finalDares = [];

    try {
      const parsedJson = JSON.parse(responseText);
      // IDEAL JSON PATH: Only works if the JSON is a perfectly formed object.
      if (parsedJson && typeof parsedJson.title === 'string' && Array.isArray(parsedJson.rules)) {
        console.log("PARSING: Success with ideal JSON structure.");
        finalTitle = parsedJson.title;
        finalRules = cleanAndDeduplicatePotentialRules(parsedJson.rules);
        if (Array.isArray(parsedJson.dares)) {
          finalDares = cleanAndDeduplicatePotentialRules(parsedJson.dares);
        }
      } else {
        // Force fallback for JSON that isn't the ideal object structure.
        throw new Error("JSON is not in the ideal format. Falling back to text parsing.");
      }
    } catch (e) {
      // UNIFIED FALLBACK PATH for any plain text or non-ideal JSON.
      console.log("PARSING: Using unified fallback for plain text or non-ideal JSON.");

      if (typeof responseText !== 'string' || !responseText.trim()) {
        throw new Error("Game generator returned an empty or invalid response.");
      }
      if (responseText.trim().toLowerCase() === "accepted") {
        throw new Error("The game generator acknowledged the request but didn't return a game. Check Make.com.");
      }

      const parts = responseText.split(DARE_SEPARATOR_KEYWORD);
      console.log(`PARSING (Fallback): Split response into ${parts.length} parts.`);

      finalTitle = parts[0] ? parts[0].trim() : '';
      const rulesPart = parts[1] || '';
      finalRules = cleanAndDeduplicatePotentialRules(rulesPart.split('\n'));
      
      const daresPart = parts[2] || '';
      finalDares = cleanAndDeduplicatePotentialRules(daresPart.split('\n'));
    }

    // --- Final Assembly ---
    if (!finalTitle) {
      finalTitle = `Sipocalypse Game for '${params.activity}'`;
      console.warn("No title found, using default.");
    }
    
    const finalGame = {
      title: finalTitle,
      rules: finalRules.slice(0, params.numberOfRules),
      dares: []
    };

    if (params.includeDares) {
      // If we got dares from the third '###' part, use them.
      if (finalDares.length > 0) {
        finalGame.dares = finalDares;
      } 
      // Otherwise, check for overflow from rules (if dares part was empty).
      else if (finalRules.length > params.numberOfRules) {
        finalGame.dares = finalRules.slice(params.numberOfRules);
      }
    }

    if (finalGame.rules.length === 0 && finalGame.dares.length === 0) {
      console.warn("No rules or dares were successfully parsed. The game is empty.");
    }
    
    console.log("FINAL GAME OBJECT:", JSON.stringify(finalGame, null, 2));
    return finalGame;

  } catch (error) {
    console.error("SERVICE CRITICAL ERROR:", error);
    throw new Error(error.message || "An unknown error occurred in the game service.");
  }
};
