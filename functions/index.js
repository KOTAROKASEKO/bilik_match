const { onCall } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Define the function (grants access to the secret key)
exports.chatWithGemini = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
    
    // 1. Initialize Gemini with the HIDDEN key
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 2. Get text from the user's request
    const userPrompt = request.data.text;

    try {
        // 3. Call Gemini
        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();

        // 4. Return the result back to your website
        return { response: text };
    } catch (error) {
        console.error("AI Error:", error);
        throw new functions.https.HttpsError('internal', 'AI generation failed');
    }
});