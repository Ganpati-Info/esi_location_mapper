import { GoogleGenAI } from "@google/genai";
import type { NormalizedAddress } from "@/types";

const schema = {
  type: "object",
  properties: {
    recipient_name: { type: ["string", "null"] },
    village_name: { type: ["string", "null"] },
    landmark: { type: ["string", "null"] },
    tehsil_taluka: { type: ["string", "null"] },
    block_name: { type: ["string", "null"] },
    district: { type: ["string", "null"] },
    state: { type: ["string", "null"] },
    post_office_name: { type: ["string", "null"] },
    pin_code: { type: ["string", "null"] }
  },
  required: [
    "recipient_name", "village_name", "landmark", "tehsil_taluka",
    "block_name", "district", "state", "post_office_name", "pin_code"
  ]
};

export async function enrichWithGemini(
  originalAddress: string,
  current: NormalizedAddress
): Promise<NormalizedAddress> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return current;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = [
      "You are an address data extraction assistant for India.",
      "Use the Mappls-extracted fields below as the primary evidence.",
      "Use the raw address only to identify fields that are visibly present.",
      "Do not invent missing administrative information.",
      "Do not convert a sub-district into a block unless the input explicitly identifies it as a block.",
      "Do not invent a person or business name.",
      "Return null when a field is not supported.",
      "",
      `Raw address: ${originalAddress}`,
      `Current structured result: ${JSON.stringify(current)}`
    ].join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const parsed = JSON.parse(response.text ?? "{}");

    return {
      ...current,
      recipient_name: parsed.recipient_name ?? current.recipient_name,
      village_name: parsed.village_name ?? current.village_name,
      landmark: parsed.landmark ?? current.landmark,
      tehsil_taluka: parsed.tehsil_taluka ?? current.tehsil_taluka,
      block_name: parsed.block_name ?? current.block_name,
      district: parsed.district ?? current.district,
      state: parsed.state ?? current.state,
      post_office_name: parsed.post_office_name ?? current.post_office_name,
      pin_code: /^[0-9]{6}$/.test(String(parsed.pin_code ?? ""))
        ? String(parsed.pin_code)
        : current.pin_code,
      confidence_score: current.confidence_score,
      provider: current.provider === "mappls-address-analytics"
        ? "mappls-address-analytics+gemini"
        : current.provider
    };
  } catch {
    return current;
  }
}
