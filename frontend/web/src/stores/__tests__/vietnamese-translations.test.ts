import { describe, it, expect } from "vitest";
import { TRANSLATIONS } from "../useTranslationStore";

const vi = TRANSLATIONS.Vietnamese;

/** Fixed mistranslations: key → the correct Vietnamese text. */
const CORRECTED: Record<string, string> = {
  "nav.personal": "Thông tin cá nhân",
  "nav.localization": "Ngôn ngữ & khu vực",
  "loc.pageTitle": "Ngôn ngữ, khu vực & đơn vị",
  "loc.toastSave": "Đã lưu cài đặt ngôn ngữ & khu vực",
  "personal.preferredName": "Tên gọi ưa thích / biệt danh",
  "pref.aisle": "Cạnh lối đi",
  "pref.window": "Cạnh cửa sổ",
  "wizard.int_wellness": "Chăm sóc sức khỏe",
  "wizard.focusLifestyleDesc": "Mua sắm, spa, quán bar & cuộc sống về đêm",
  "wizard.constraintCrowdsDesc":
    "Ưu tiên địa điểm ít người biết, tránh giờ cao điểm",
  "wizard.constraintIndoorDesc":
    "Bảo tàng, trung tâm thương mại, không đi ngoài trời",
  "wizard.constraintNoLateNightsDesc":
    "Kết thúc trước 22 giờ, không quán bar/hộp đêm",
  "wizard.warnLifestyleLateNights":
    "⚠️ “Cuộc sống về đêm” và “Về sớm” có thể xung đột. Chúng tôi sẽ ưu tiên các quán bar đóng cửa trước 22h.",
  "wizard.infoCrowdsLifestyle":
    "ℹ️ Sẽ gợi ý cửa hàng nhỏ độc đáo thay vì trung tâm thương mại lớn và chợ đêm đông.",
  "wizard.constraintIncompatible": "Không tương thích với trọng tâm hiện tại",
  "wizard.transportPublicDesc":
    "Xe buýt / tàu điện / xe điện — tốt cho khoảng cách dưới 10 km",
  "trip.reGeocoding": "Đang xác định tọa độ...",
  "trip.reGeocodeLoading": "Đang xác định lại tọa độ các hoạt động...",
  "trip.reGeocodeFailed":
    "Xác định lại tọa độ thất bại. Vui lòng kiểm tra API key.",
  "map.flyToDay": "Chuyển đến ngày",
  "trip.noItineraryDesc":
    "Tạo chuyến đi mới từ “Chuyến đi của tôi” và chúng tôi sẽ lập kế hoạch cho bạn.",
};

// Words that keep their capital letter mid-sentence in Vietnamese
// (proper nouns, place names, product names).
const PROPER_NOUNS = new Set([
  "Anh",
  "Mỹ",
  "Pháp",
  "Việt",
  "Nam",
  "Hoa",
  "A", // "A → Z", "N/A"
  "N",
  "Z",
  "Nhật",
  "Bản",
  "Kyoto",
  "Tokyo",
  "Bangkok",
  "Pro",
  "Airbnb",
  "Google",
  "Places",
  "Clerk",
  "Gemini",
  "Mapbox",
  "Taxi",
]);

/** Words that start a new "sentence" (capital allowed): string start, after . ! ? : — ( “ or a leading emoji. */
const SEGMENT_START = /(^|[.!?:—(“]\s*|^[^\p{L}]+|^ℹ️?\s*)$/u;

/** Capitalised Vietnamese words that are not at the start of a sentence segment. */
function findTitleCaseWords(text: string): string[] {
  const out: string[] = [];
  const re = /[\p{L}][\p{L}\p{M}]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const word = m[0];
    if (!/^\p{Lu}\p{Ll}*$/u.test(word)) continue; // acronyms, lowercase, mixed
    if (PROPER_NOUNS.has(word)) continue;
    const before = text.slice(0, m.index);
    if (word === "Kỳ" && before.endsWith("Hoa ")) continue; // Hoa Kỳ = USA
    if (SEGMENT_START.test(before)) continue;
    out.push(word);
  }
  return out;
}

describe("Vietnamese dictionary — corrected translations", () => {
  it.each(Object.entries(CORRECTED))("%s", (key, expected) => {
    expect(vi[key]).toBe(expected);
  });

  it("no longer contains the 'Cáo nhân' typo", () => {
    const bad = Object.entries(vi).filter(([, v]) => /cáo nhân/i.test(v));
    expect(bad).toEqual([]);
  });

  it("does not translate Localization as 'định vị' (GPS positioning)", () => {
    const bad = Object.entries(vi).filter(([, v]) => /định vị/i.test(v));
    expect(bad).toEqual([]);
  });
});

describe("Vietnamese dictionary — no mixed English in the trip planner", () => {
  const LEFTOVER_ENGLISH =
    /\b(nightlife|malls?|boutique|hidden gems|focus|bars|geocod\w*|tram)\b/i;

  it("wizard, trip and map strings contain no leftover English words", () => {
    const bad = Object.entries(vi)
      .filter(([k]) => /^(wizard|trip|map)\./.test(k))
      .filter(([, v]) => LEFTOVER_ENGLISH.test(v))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

describe("Vietnamese dictionary — consistent sentence-case capitalisation", () => {
  it("only the first word of a sentence and proper nouns are capitalised", () => {
    const bad = Object.entries(vi)
      .map(([k, v]) => [k, findTitleCaseWords(v)] as const)
      .filter(([, words]) => words.length > 0)
      .map(([k, words]) => `${k}: ${words.join(", ")}`);
    expect(bad).toEqual([]);
  });

  it("flags Title Case in the helper itself", () => {
    expect(findTitleCaseWords("Thông tin Cá nhân")).toEqual(["Cá"]);
    expect(findTitleCaseWords("Thông tin cá nhân")).toEqual([]);
    expect(findTitleCaseWords("Tiếng Việt")).toEqual([]);
    expect(findTitleCaseWords("Loại chỗ Ở")).toEqual(["Ở"]);
    expect(findTitleCaseWords("Sử dụng trong chu Kỳ")).toEqual(["Kỳ"]);
    expect(findTitleCaseWords("♿ Di chuyển thoải mái")).toEqual([]);
    expect(findTitleCaseWords("Xong. Tiếp theo")).toEqual([]);
  });
});
