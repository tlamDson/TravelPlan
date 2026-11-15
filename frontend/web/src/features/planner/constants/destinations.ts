export const MVP_COUNTRY_IDS = ["vietnam", "us", "france"] as const;

export interface Country {
  id: string;
  name: string;
  nameEn: string;
  isMVP: boolean;
}

export interface City {
  id: string;
  name: string;
  nameEn: string;
  /** Format sent to the backend: "City, Country" */
  destinationValue: string;
}

export const COUNTRIES: Country[] = [
  { id: "vietnam", name: "Việt Nam", nameEn: "Vietnam", isMVP: true },
  { id: "us", name: "Hoa Kỳ", nameEn: "United States", isMVP: true },
  { id: "france", name: "Pháp", nameEn: "France", isMVP: true },
  { id: "japan", name: "Nhật Bản", nameEn: "Japan", isMVP: false },
  { id: "thailand", name: "Thái Lan", nameEn: "Thailand", isMVP: false },
  { id: "south_korea", name: "Hàn Quốc", nameEn: "South Korea", isMVP: false },
  { id: "singapore", name: "Singapore", nameEn: "Singapore", isMVP: false },
  { id: "australia", name: "Úc", nameEn: "Australia", isMVP: false },
  { id: "uk", name: "Vương quốc Anh", nameEn: "United Kingdom", isMVP: false },
  { id: "italy", name: "Ý", nameEn: "Italy", isMVP: false },
  { id: "spain", name: "Tây Ban Nha", nameEn: "Spain", isMVP: false },
  { id: "germany", name: "Đức", nameEn: "Germany", isMVP: false },
  { id: "netherlands", name: "Hà Lan", nameEn: "Netherlands", isMVP: false },
  { id: "canada", name: "Canada", nameEn: "Canada", isMVP: false },
  { id: "mexico", name: "Mexico", nameEn: "Mexico", isMVP: false },
  { id: "indonesia", name: "Indonesia", nameEn: "Indonesia", isMVP: false },
  { id: "malaysia", name: "Malaysia", nameEn: "Malaysia", isMVP: false },
  { id: "india", name: "Ấn Độ", nameEn: "India", isMVP: false },
  { id: "china", name: "Trung Quốc", nameEn: "China", isMVP: false },
  { id: "other", name: "Khác", nameEn: "Other", isMVP: false },
];

export const CITIES_BY_COUNTRY: Record<string, City[]> = {
  vietnam: [
    {
      id: "hanoi",
      name: "Hà Nội",
      nameEn: "Hanoi",
      destinationValue: "Hanoi, Vietnam",
    },
    {
      id: "hochiminh",
      name: "TP. Hồ Chí Minh",
      nameEn: "Ho Chi Minh City",
      destinationValue: "Ho Chi Minh City, Vietnam",
    },
    {
      id: "danang",
      name: "Đà Nẵng",
      nameEn: "Da Nang",
      destinationValue: "Da Nang, Vietnam",
    },
    {
      id: "hoian",
      name: "Hội An",
      nameEn: "Hoi An",
      destinationValue: "Hoi An, Vietnam",
    },
    {
      id: "nhatrang",
      name: "Nha Trang",
      nameEn: "Nha Trang",
      destinationValue: "Nha Trang, Vietnam",
    },
    {
      id: "dalat",
      name: "Đà Lạt",
      nameEn: "Da Lat",
      destinationValue: "Da Lat, Vietnam",
    },
    {
      id: "phuquoc",
      name: "Phú Quốc",
      nameEn: "Phu Quoc",
      destinationValue: "Phu Quoc, Vietnam",
    },
    {
      id: "halong",
      name: "Hạ Long",
      nameEn: "Ha Long",
      destinationValue: "Ha Long, Vietnam",
    },
    {
      id: "sapa",
      name: "Sapa",
      nameEn: "Sapa",
      destinationValue: "Sapa, Vietnam",
    },
    { id: "hue", name: "Huế", nameEn: "Hue", destinationValue: "Hue, Vietnam" },
    {
      id: "cantho",
      name: "Cần Thơ",
      nameEn: "Can Tho",
      destinationValue: "Can Tho, Vietnam",
    },
    {
      id: "vungtau",
      name: "Vũng Tàu",
      nameEn: "Vung Tau",
      destinationValue: "Vung Tau, Vietnam",
    },
  ],
  us: [
    {
      id: "nyc",
      name: "New York City",
      nameEn: "New York City",
      destinationValue: "New York City, United States",
    },
    {
      id: "la",
      name: "Los Angeles",
      nameEn: "Los Angeles",
      destinationValue: "Los Angeles, United States",
    },
    {
      id: "sanfrancisco",
      name: "San Francisco",
      nameEn: "San Francisco",
      destinationValue: "San Francisco, United States",
    },
    {
      id: "chicago",
      name: "Chicago",
      nameEn: "Chicago",
      destinationValue: "Chicago, United States",
    },
    {
      id: "miami",
      name: "Miami",
      nameEn: "Miami",
      destinationValue: "Miami, United States",
    },
    {
      id: "lasvegas",
      name: "Las Vegas",
      nameEn: "Las Vegas",
      destinationValue: "Las Vegas, United States",
    },
    {
      id: "seattle",
      name: "Seattle",
      nameEn: "Seattle",
      destinationValue: "Seattle, United States",
    },
    {
      id: "boston",
      name: "Boston",
      nameEn: "Boston",
      destinationValue: "Boston, United States",
    },
    {
      id: "washington",
      name: "Washington DC",
      nameEn: "Washington DC",
      destinationValue: "Washington DC, United States",
    },
    {
      id: "austin",
      name: "Austin",
      nameEn: "Austin",
      destinationValue: "Austin, United States",
    },
    {
      id: "denver",
      name: "Denver",
      nameEn: "Denver",
      destinationValue: "Denver, United States",
    },
    {
      id: "atlanta",
      name: "Atlanta",
      nameEn: "Atlanta",
      destinationValue: "Atlanta, United States",
    },
    {
      id: "sandiego",
      name: "San Diego",
      nameEn: "San Diego",
      destinationValue: "San Diego, United States",
    },
    {
      id: "honolulu",
      name: "Honolulu",
      nameEn: "Honolulu",
      destinationValue: "Honolulu, United States",
    },
    {
      id: "neworleans",
      name: "New Orleans",
      nameEn: "New Orleans",
      destinationValue: "New Orleans, United States",
    },
  ],
  france: [
    {
      id: "paris",
      name: "Paris",
      nameEn: "Paris",
      destinationValue: "Paris, France",
    },
    {
      id: "lyon",
      name: "Lyon",
      nameEn: "Lyon",
      destinationValue: "Lyon, France",
    },
    {
      id: "marseille",
      name: "Marseille",
      nameEn: "Marseille",
      destinationValue: "Marseille, France",
    },
    {
      id: "nice",
      name: "Nice",
      nameEn: "Nice",
      destinationValue: "Nice, France",
    },
    {
      id: "bordeaux",
      name: "Bordeaux",
      nameEn: "Bordeaux",
      destinationValue: "Bordeaux, France",
    },
    {
      id: "toulouse",
      name: "Toulouse",
      nameEn: "Toulouse",
      destinationValue: "Toulouse, France",
    },
    {
      id: "strasbourg",
      name: "Strasbourg",
      nameEn: "Strasbourg",
      destinationValue: "Strasbourg, France",
    },
    {
      id: "nantes",
      name: "Nantes",
      nameEn: "Nantes",
      destinationValue: "Nantes, France",
    },
    {
      id: "montpellier",
      name: "Montpellier",
      nameEn: "Montpellier",
      destinationValue: "Montpellier, France",
    },
    {
      id: "lille",
      name: "Lille",
      nameEn: "Lille",
      destinationValue: "Lille, France",
    },
    {
      id: "cannes",
      name: "Cannes",
      nameEn: "Cannes",
      destinationValue: "Cannes, France",
    },
  ],
  // Other countries: empty → use free-text city
};

export function isMVPCountry(countryId: string): boolean {
  return (MVP_COUNTRY_IDS as readonly string[]).includes(countryId);
}

export function getCitiesForCountry(countryId: string): City[] {
  return CITIES_BY_COUNTRY[countryId] ?? [];
}
