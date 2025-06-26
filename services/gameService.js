
// Helper function to escape special characters for use in a regular expression
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const GAME_GENERATOR_WEBHOOK_URL = 'https://hook.eu2.make.com/8ym052altan60ddmeki1zl2160f1ghxr';
const DARE_SEPARATOR_KEYWORD = "dares"; // Case-insensitive check will be used

export const generateGameViaWebhook = async (params) => {
  if (!params.activity || params.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  let response;
  try {
    console.log("Sending to webhook. Payload:", JSON.stringify(params));
    response = await fetch(GAME_GENERATOR_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
  } catch (networkError) {
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
      // Ignore
    }
    console.error(errorDetails);
    throw new Error(errorDetails);
  }

  const responseText = await response.text();
  let generatedGame = null;
  let rawRules = [];
  let rawDares = [];
  let titleFromResponse;

  try {
    const parsedJson = JSON.parse(responseText);
    titleFromResponse = parsedJson.title;

    if (parsedJson && typeof parsedJson.title === 'string') {
      if (Array.isArray(parsedJson.rules) && Array.isArray(parsedJson.dares)) {
        rawRules = parsedJson.rules.filter(rule => typeof rule === 'string');
        rawDares = parsedJson.dares.filter(dare => typeof dare === 'string');
        console.log("JSON PARSING: Found distinct 'rules' and 'dares' arrays.");
      } else if (Array.isArray(parsedJson.rules)) {
        console.log("JSON PARSING: Found 'rules' array, checking for 'Dares' separator keyword.");
        const separatorIndex = parsedJson.rules.findIndex(item =>
          typeof item === 'string' && item.toLowerCase().trim() === DARE_SEPARATOR_KEYWORD
        );

        if (separatorIndex !== -1) {
          rawRules = parsedJson.rules.slice(0, separatorIndex).filter(rule => typeof rule === 'string');
          rawDares = parsedJson.rules.slice(separatorIndex + 1).filter(dare => typeof dare === 'string');
          console.log(`JSON PARSING: 'Dares' keyword found at index ${separatorIndex}. Split into ${rawRules.length} rules and ${rawDares.length} dares.`);
        } else {
          rawRules = parsedJson.rules.filter(rule => typeof rule === 'string');
          console.log("JSON PARSING: No 'Dares' keyword in 'rules' array. All items treated as potential rules/mixed content.");
        }
      } else {
        console.warn("Parsed JSON, but 'rules' is not an array or structure is unexpected:", parsedJson);
      }
    } else {
      console.warn("Parsed JSON, but it does not match expected GeneratedGame structure (missing title):", parsedJson);
    }
  } catch (parseError) {
    console.log("Failed to parse JSON response from webhook. Attempting plain text parsing. Error:", parseError.message);
    const trimmedResponseText = responseText.trim().toLowerCase();
    if (trimmedResponseText === "accepted") {
      console.error("Webhook returned 'Accepted' instead of game data.");
      throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
    }

    const lines = responseText.split('\n').map(line => line.trim()).filter(line => line !== "");
    const titleParts = [];
    let itemsStartedBasedOnNumbering = false;
    const separatorIndex = lines.findIndex(line => line.toLowerCase() === DARE_SEPARATOR_KEYWORD);
    
    const potentialItems = [];

    if (separatorIndex !== -1) {
        console.log(`PLAIN TEXT: "Dares" keyword found at line index ${separatorIndex}.`);
        for(let i=0; i < separatorIndex; i++) {
            const line = lines[i];
            if (!/^\s*\d+\.\s*/.test(line) && rawRules.length === 0) {
                titleParts.push(line);
            } else {
                rawRules.push(line.replace(/^\s*\d+\.\s*/, '').trim());
            }
        }
        rawDares = lines.slice(separatorIndex + 1).map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(dare => dare !== "");
    } else {
        console.log("PLAIN TEXT: No 'Dares' keyword found. Treating lines based on numbering or as mixed content.");
        for (const line of lines) {
            if (!itemsStartedBasedOnNumbering && !/^\s*\d+\.\s*/.test(line)) {
                titleParts.push(line);
            } else {
                itemsStartedBasedOnNumbering = true;
                potentialItems.push(line.replace(/^\s*\d+\.\s*/, '').trim());
            }
        }
        rawRules = potentialItems;
    }
    titleFromResponse = titleParts.join(' ').trim();
  }

  if (!titleFromResponse) {
    console.warn("No title found. Generating default title.");
    titleFromResponse = `Sipocalypse Game for '${params.activity}'`;
  } else if (params.activity && params.activity.trim().length > 0) {
    const singleActivity = params.activity.trim();
    const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
    if (doubleActivityPattern.test(titleFromResponse)) {
      console.warn(`Sanitizing title: Detected doubled activity name "${titleFromResponse}". Reducing to "${singleActivity}".`);
      titleFromResponse = singleActivity;
    }
  }
  
  generatedGame = {
    title: titleFromResponse,
    rules: [],
    dares: []
  };

  console.log(`PRE-PROCESSING: Raw Rules (${rawRules.length}):`, JSON.stringify(rawRules.slice(0,5)));
  console.log(`PRE-PROCESSING: Raw Dares (${rawDares.length}):`, JSON.stringify(rawDares.slice(0,5)));
  console.log(`PRE-PROCESSING: Params: numberOfRules=${params.numberOfRules}, includeDares=${params.includeDares}`);

  generatedGame.rules = rawRules.slice(0, params.numberOfRules);

  if (params.includeDares) {
    if (rawDares.length > 0) {
        generatedGame.dares = rawDares;
        console.log(`PROCESSING: Using explicitly separated/provided rawDares. Count: ${generatedGame.dares.length}`);
    } else if (rawRules.length > params.numberOfRules) {
        generatedGame.dares = rawRules.slice(params.numberOfRules);
        console.log(`PROCESSING: No explicit dares, taking dares from rules overflow. Count: ${generatedGame.dares.length}`);
    } else {
        generatedGame.dares = [];
        console.log(`PROCESSING: No explicit dares and no rules overflow. Dares empty.`);
    }
  } else {
    generatedGame.dares = [];
    console.log("PROCESSING: Dares not requested. Dares set to empty.");
  }

  if (!generatedGame.title || !Array.isArray(generatedGame.rules) || generatedGame.rules.length === 0) {
    console.error("Constructed game is missing essential fields or has no rules:", generatedGame);
    console.error("Original responseText snippet:", responseText.substring(0,300));
    throw new Error("The game generator returned an incomplete or unparsable game structure. Try adjusting your options or rephrasing the activity.");
  }
  
  console.log("FINAL GAME OBJECT:", JSON.stringify(generatedGame));
  return generatedGame;
};
