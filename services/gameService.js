
// Helper function to escape special characters for use in a regular expression
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const GAME_GENERATOR_WEBHOOK_URL = 'https://hook.eu2.make.com/8ym052altan60ddmeki1zl2160f1ghxr';
const DARE_SEPARATOR_KEYWORD = "###";

// Cleans an array of potential strings: trims, filters out non-strings and empty strings.
const cleanStringArrayBasic = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(item => typeof item === 'string')
    .map(s => s.trim())
    .filter(s => s !== '');
};

// Cleans rule/dare lines: removes leading numbering (e.g., "1. "), trims, and filters empty.
const cleanAndDeduplicatePotentialRules = (lines) => {
  if (!Array.isArray(lines)) return [];
  return lines.map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(rule => rule !== "");
};

// Helper function to parse items using two separators (primarily for JSON arrays where "###" is an item)
function parseItemsWithTwoSeparators(items, separator) {
    let titleStr;
    let rulesContent = []; 
    let daresContent = []; 

    const stringItems = items.map(item => String(item).trim()).filter(s => s !== '');

    console.log(`HELPER: Initial stringItems for parseItemsWithTwoSeparators (trimmed, non-empty):`, JSON.stringify(stringItems));

    if (stringItems.length === 0) {
        console.log(`HELPER: Input items array is empty after trimming.`);
        return { title: undefined, rulesBlock: [], daresBlock: [] };
    }
    
    if (stringItems.length === 1 && stringItems[0].includes(separator)) {
        const singleItemContent = stringItems[0];
        console.log(`HELPER: Single item found containing separator(s): "${singleItemContent}"`);
        const parts = singleItemContent.split(separator);
        
        titleStr = parts[0]?.trim();
        if (titleStr === "") titleStr = undefined; 

        if (parts.length > 1) { 
            const rulesPart = parts[1]?.trim();
            if (rulesPart) rulesContent = [rulesPart]; 
        }
        if (parts.length > 2) { 
            const daresPart = parts[2]?.trim();
            if (daresPart) daresContent = [daresPart]; 
        }
        console.log(`HELPER (Single-item split): Title: "${titleStr}", Rules Block: [${rulesContent.join('; ')}], Dares Block: [${daresContent.join('; ')}]`);
    } else { 
        const firstSepIdx = stringItems.findIndex(item => item === separator);
        if (firstSepIdx !== -1) {
            titleStr = stringItems.slice(0, firstSepIdx).join(' ').trim(); 
            if (titleStr === "") titleStr = undefined;

            const itemsAfterFirst = stringItems.slice(firstSepIdx + 1);
            const secondSepIdx = itemsAfterFirst.findIndex(item => item === separator);

            if (secondSepIdx !== -1) {
                rulesContent = itemsAfterFirst.slice(0, secondSepIdx); 
                daresContent = itemsAfterFirst.slice(secondSepIdx + 1); 
            } else {
                rulesContent = itemsAfterFirst; 
            }
        } else { 
            if (stringItems.length > 0) {
                titleStr = stringItems[0]; 
                rulesContent = stringItems.slice(1); 
            }
        }
        console.log(`HELPER (Multi-item logic): Title: "${titleStr}", Rules Block Items: ${rulesContent.length}, Dares Block Items: ${daresContent.length}`);
    }
    
    if (titleStr === separator) titleStr = undefined;

    return {
        title: titleStr || undefined,
        rulesBlock: cleanStringArrayBasic(rulesContent), 
        daresBlock: cleanStringArrayBasic(daresContent)  
    };
}


export const generateGameViaWebhook = async (params) => {
  if (!params.activity || params.activity.trim() === "") {
    throw new Error("Activity must be provided to generate a game.");
  }

  try {
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
      throw new Error(`Failed to connect to the game generator: ${networkError.message || String(networkError)}. Please check your internet connection.`);
    }

    if (!response.ok) {
      let errorDetails = `Webhook request failed with status: ${response.status}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          errorDetails += ` - ${errorText}`;
        }
      } catch (e) { /* Ignore */ }
      console.error(errorDetails);
      throw new Error(errorDetails);
    }

    const responseText = await response.text();
    console.log("Webhook Raw Response Text:", responseText);

    let titleStr;
    let rawRulesBlockStrings = []; 
    let rawDaresBlockStrings = [];
    let parsedIdeallyFromJson = false;

    try {
      const parsedJson = JSON.parse(responseText);
      console.log("PARSING: Attempting JSON parse. Parsed object:", parsedJson);

      if (parsedJson.title && typeof parsedJson.title === 'string' &&
          Array.isArray(parsedJson.rules)
      ) {
          titleStr = parsedJson.title.trim();
          rawRulesBlockStrings = parsedJson.rules.map(item => String(item).trim()).filter(Boolean); 
          rawDaresBlockStrings = Array.isArray(parsedJson.dares) ? parsedJson.dares.map(item => String(item).trim()).filter(Boolean) : [];
          parsedIdeallyFromJson = true;
          console.log("PARSING: Ideal JSON structure {title, rules, ?dares} direct parse.");
      } else {
          let itemsForSeparatorParsing = [];
          let potentialJsonTitle = undefined;

          if (parsedJson.title && typeof parsedJson.title === 'string') {
              potentialJsonTitle = parsedJson.title.trim();
          }

          if (Array.isArray(parsedJson)) {
              itemsForSeparatorParsing = parsedJson.map(item => String(item));
          } else if (parsedJson.content && Array.isArray(parsedJson.content)) { 
              itemsForSeparatorParsing = parsedJson.content.map(item => String(item));
          } else if (parsedJson.rules && Array.isArray(parsedJson.rules) && !parsedJson.title) {
              itemsForSeparatorParsing = parsedJson.rules.map(item => String(item));
          }


          if (itemsForSeparatorParsing.length > 0) {
              console.log("PARSING: JSON with array-like content, passing to parseItemsWithTwoSeparators. Items:", JSON.stringify(itemsForSeparatorParsing));
              const { title: sepParsedTitle, rulesBlock: sepParsedRules, daresBlock: sepParsedDares } = parseItemsWithTwoSeparators(itemsForSeparatorParsing, DARE_SEPARATOR_KEYWORD);
              titleStr = potentialJsonTitle || sepParsedTitle;
              rawRulesBlockStrings = sepParsedRules; 
              rawDaresBlockStrings = sepParsedDares;
          } else if (potentialJsonTitle) { 
              titleStr = potentialJsonTitle;
              console.log("PARSING: JSON with title, but no parsable rule/dare array. Rules/dares default to empty.");
          } else {
              console.log("PARSING: Unrecognized JSON structure, will fall to plain text mode after this catch block.");
              throw new Error("Force plain text parsing for non-standard JSON."); 
          }
      }
    } catch (e) {
        if (!parsedIdeallyFromJson) { 
          console.log("PARSING: Plain text mode activated. Raw Response Text has been logged above.");
          const textParts = responseText.split(DARE_SEPARATOR_KEYWORD);
          console.log(`PARSING (Plain Text Direct Split by "###"): Found ${textParts.length} parts.`);

          if (textParts.length === 1 && textParts[0].trim().toLowerCase() === "accepted") {
              console.error("Webhook returned 'Accepted' instead of game data (plain text path).");
              throw new Error("The game generator acknowledged the request but didn't return a game. Please check your Make.com scenario configuration or try again.");
          }

          if (textParts.length > 0) {
              titleStr = textParts[0].trim();
              console.log(`PARSING (Plain Text Direct Split): Tentative Title: "${titleStr}"`);
          }
          if (textParts.length > 1 && textParts[1].trim() !== "") {
              rawRulesBlockStrings = [textParts[1]]; 
              console.log(`PARSING (Plain Text Direct Split): Tentative Raw Rules Block String:`, JSON.stringify(rawRulesBlockStrings));
          }
          if (textParts.length > 2 && textParts[2].trim() !== "") {
              rawDaresBlockStrings = [textParts[2]]; 
              console.log(`PARSING (Plain Text Direct Split): Tentative Raw Dares Block String:`, JSON.stringify(rawDaresBlockStrings));
          }
      } else {
          const errorMessage = (e instanceof Error) ? e.message : String(e);
          console.error("Error during or after ideal JSON parsing attempt (unexpected):", errorMessage);
      }
    }

    console.log(`PRE-EXPANSION: Title: "${titleStr}"`);
    console.log(`PRE-EXPANSION: Raw Rules Block Strings (${rawRulesBlockStrings.length}):`, JSON.stringify(rawRulesBlockStrings));
    console.log(`PRE-EXPANSION: Raw Dares Block Strings (${rawDaresBlockStrings.length}):`, JSON.stringify(rawDaresBlockStrings));
    
    const expandedRules = rawRulesBlockStrings.flatMap(block => block.split('\n'));
    const expandedDares = rawDaresBlockStrings.flatMap(block => block.split('\n'));

    console.log(`POST-EXPANSION: Expanded Rules (${expandedRules.length}):`, JSON.stringify(expandedRules.slice(0,10)));
    console.log(`POST-EXPANSION: Expanded Dares (${expandedDares.length}):`, JSON.stringify(expandedDares.slice(0,10)));

    if (!titleStr || titleStr.trim() === "") {
      titleStr = `Sipocalypse Game for '${params.activity}'`;
      console.warn("No title found after parsing, using default.");
    } else {
      const singleActivity = params.activity.trim();
       if (singleActivity){
          const doubleActivityPattern = new RegExp(`^${escapeRegExp(singleActivity)}\\s+${escapeRegExp(singleActivity)}$`, 'i');
          if (doubleActivityPattern.test(titleStr)) {
            console.warn(`Sanitizing title: Detected doubled activity name "${titleStr}". Reducing to "${singleActivity}".`);
            titleStr = singleActivity;
          }
      }
    }

    const finalRulesArr = cleanAndDeduplicatePotentialRules(expandedRules);
    const finalDaresArr = cleanAndDeduplicatePotentialRules(expandedDares);

    console.log(`POST-CLEANING: Title: "${titleStr}"`);
    console.log(`POST-CLEANING: Final Rules (${finalRulesArr.length}):`, JSON.stringify(finalRulesArr.slice(0,10)));
    console.log(`POST-CLEANING: Final Dares (${finalDaresArr.length}):`, JSON.stringify(finalDaresArr.slice(0,10)));
    console.log(`POST-CLEANING: Params: numberOfRules=${params.numberOfRules}, includeDares=${params.includeDares}`);

    const finalGame = {
      title: titleStr,
      rules: finalRulesArr.slice(0, params.numberOfRules), 
      dares: []
    };

    if (params.includeDares) {
      if (finalDaresArr.length > 0) {
        finalGame.dares = finalDaresArr;
        console.log(`PROCESSING: Using explicitly parsed and cleaned dares. Count: ${finalDaresArr.length}`);
      } else if (finalRulesArr.length > params.numberOfRules) {
        finalGame.dares = finalRulesArr.slice(params.numberOfRules);
        console.log(`PROCESSING: No explicit dares. Using rules overflow as dares. Count: ${finalGame.dares.length}`);
      } else {
        console.log(`PROCESSING: IncludeDares is true, but no explicit dares found and no rules overflow.`);
      }
    }
    
     if (finalGame.rules.length === 0 && (!finalGame.dares || finalGame.dares.length === 0)) {
       console.warn("No rules or dares were successfully parsed or generated. The game will be empty except for the title.");
     }
    
    console.log("FINAL GAME OBJECT:", JSON.stringify(finalGame));
    return finalGame;

  } catch (error) {
    const errorMessage = error?.message || (typeof error === 'string' ? error : "An unknown error occurred within the game generation service.");
    console.error("SERVICE CRITICAL ERROR in generateGameViaWebhook:", errorMessage, error);
    throw new Error(`Game Service Error: ${errorMessage}`);
  }
};
