/**
 * Three-language copy for the public About / Privacy / Terms pages and the
 * landing footer links. Spread into TRANSLATIONS in useTranslationStore.
 */

type Copy = Record<string, string>;

const EN: Copy = {
  "landing.footer.about": "About",
  "landing.footer.privacy": "Privacy",
  "landing.footer.terms": "Terms",
  "landing.info.backHome": "Back to home",

  "landing.about.title": "About TravelPlan",
  "landing.about.intro":
    "TravelPlan is an AI-assisted travel itinerary planner. Tell us where you are going and what you like, and we build a day-by-day plan.",
  "landing.about.s1.heading": "How it works",
  "landing.about.s1.body":
    "An AI model suggests places for your trip. Every suggestion is checked against Google Places and Mapbox, grouped by location, and arranged into a realistic daily route.",
  "landing.about.s2.heading": "Verified places",
  "landing.about.s2.body":
    "AI suggestions are treated as untrusted: a place only appears in your itinerary after it has been verified to exist.",

  "landing.privacy.title": "Privacy Policy",
  "landing.privacy.intro":
    "This page explains what TravelPlan stores and which services process it.",
  "landing.privacy.s1.heading": "What we store",
  "landing.privacy.s1.body":
    "Your account details (handled by our sign-in provider, Clerk) and the trips you create: destinations, dates, preferences and the generated itinerary.",
  "landing.privacy.s2.heading": "Services that process your data",
  "landing.privacy.s2.body":
    "Trip details are sent to Google Gemini to generate suggestions, and place names are looked up with Google Places and Mapbox. Data is stored in MongoDB.",
  "landing.privacy.s3.heading": "Your choices",
  "landing.privacy.s3.body":
    "You can delete a trip at any time from your trips page. We do not sell your data.",

  "landing.terms.title": "Terms of Service",
  "landing.terms.intro":
    "By creating an account or using TravelPlan you agree to these terms.",
  "landing.terms.s1.heading": "Use of the service",
  "landing.terms.s1.body":
    "TravelPlan is provided as is. Use it for planning your own trips and do not misuse or attempt to disrupt the service.",
  "landing.terms.s2.heading": "Itineraries are suggestions",
  "landing.terms.s2.body":
    "Itineraries are generated with AI and may contain mistakes. Check opening hours, prices and travel requirements before you rely on them.",
  "landing.terms.s3.heading": "Changes",
  "landing.terms.s3.body":
    "We may update the service and these terms. Continued use after a change means you accept the updated terms.",
};

const FR: Copy = {
  "landing.footer.about": "À propos",
  "landing.footer.privacy": "Confidentialité",
  "landing.footer.terms": "Conditions",
  "landing.info.backHome": "Retour à l'accueil",

  "landing.about.title": "À propos de TravelPlan",
  "landing.about.intro":
    "TravelPlan est un planificateur d'itinéraires de voyage assisté par IA. Dites-nous où vous allez et ce que vous aimez, et nous construisons un programme jour par jour.",
  "landing.about.s1.heading": "Comment ça marche",
  "landing.about.s1.body":
    "Un modèle d'IA propose des lieux pour votre voyage. Chaque suggestion est vérifiée avec Google Places et Mapbox, regroupée par secteur, puis organisée en un parcours quotidien réaliste.",
  "landing.about.s2.heading": "Lieux vérifiés",
  "landing.about.s2.body":
    "Les suggestions de l'IA ne sont pas considérées comme fiables : un lieu n'apparaît dans votre itinéraire qu'après avoir été vérifié.",

  "landing.privacy.title": "Politique de confidentialité",
  "landing.privacy.intro":
    "Cette page explique ce que TravelPlan conserve et quels services traitent ces données.",
  "landing.privacy.s1.heading": "Ce que nous conservons",
  "landing.privacy.s1.body":
    "Les informations de votre compte (gérées par notre fournisseur de connexion, Clerk) et les voyages que vous créez : destinations, dates, préférences et itinéraire généré.",
  "landing.privacy.s2.heading": "Services qui traitent vos données",
  "landing.privacy.s2.body":
    "Les détails du voyage sont envoyés à Google Gemini pour générer des suggestions, et les noms de lieux sont recherchés avec Google Places et Mapbox. Les données sont stockées dans MongoDB.",
  "landing.privacy.s3.heading": "Vos choix",
  "landing.privacy.s3.body":
    "Vous pouvez supprimer un voyage à tout moment depuis la page de vos voyages. Nous ne vendons pas vos données.",

  "landing.terms.title": "Conditions d'utilisation",
  "landing.terms.intro":
    "En créant un compte ou en utilisant TravelPlan, vous acceptez ces conditions.",
  "landing.terms.s1.heading": "Utilisation du service",
  "landing.terms.s1.body":
    "TravelPlan est fourni « tel quel ». Utilisez-le pour planifier vos propres voyages, sans détourner le service ni chercher à le perturber.",
  "landing.terms.s2.heading": "Les itinéraires sont des suggestions",
  "landing.terms.s2.body":
    "Les itinéraires sont générés par IA et peuvent contenir des erreurs. Vérifiez les horaires, les prix et les conditions d'entrée avant de vous y fier.",
  "landing.terms.s3.heading": "Modifications",
  "landing.terms.s3.body":
    "Nous pouvons mettre à jour le service et ces conditions. Continuer à l'utiliser après une modification signifie que vous acceptez les conditions mises à jour.",
};

const VI: Copy = {
  "landing.footer.about": "Giới thiệu",
  "landing.footer.privacy": "Quyền riêng tư",
  "landing.footer.terms": "Điều khoản",
  "landing.info.backHome": "Về trang chủ",

  "landing.about.title": "Giới thiệu TravelPlan",
  "landing.about.intro":
    "TravelPlan là công cụ lên lịch trình du lịch có AI hỗ trợ. Hãy cho chúng tôi biết bạn đi đâu và thích gì, chúng tôi sẽ xây dựng kế hoạch từng ngày.",
  "landing.about.s1.heading": "Cách hoạt động",
  "landing.about.s1.body":
    "Một mô hình AI gợi ý các địa điểm cho chuyến đi của bạn. Mỗi gợi ý đều được kiểm tra với Google Places và Mapbox, nhóm theo khu vực và sắp xếp thành lộ trình mỗi ngày hợp lý.",
  "landing.about.s2.heading": "Địa điểm đã xác minh",
  "landing.about.s2.body":
    "Gợi ý của AI không được tin tưởng mặc định: một địa điểm chỉ xuất hiện trong lịch trình sau khi đã được xác minh là có thật.",

  "landing.privacy.title": "Chính sách quyền riêng tư",
  "landing.privacy.intro":
    "Trang này giải thích TravelPlan lưu trữ những gì và dịch vụ nào xử lý dữ liệu đó.",
  "landing.privacy.s1.heading": "Chúng tôi lưu trữ gì",
  "landing.privacy.s1.body":
    "Thông tin tài khoản của bạn (do nhà cung cấp đăng nhập Clerk xử lý) và các chuyến đi bạn tạo: điểm đến, ngày đi, sở thích và lịch trình được tạo.",
  "landing.privacy.s2.heading": "Dịch vụ xử lý dữ liệu của bạn",
  "landing.privacy.s2.body":
    "Thông tin chuyến đi được gửi tới Google Gemini để tạo gợi ý, và tên địa điểm được tra cứu bằng Google Places và Mapbox. Dữ liệu được lưu trong MongoDB.",
  "landing.privacy.s3.heading": "Lựa chọn của bạn",
  "landing.privacy.s3.body":
    "Bạn có thể xóa chuyến đi bất kỳ lúc nào từ trang chuyến đi của mình. Chúng tôi không bán dữ liệu của bạn.",

  "landing.terms.title": "Điều khoản dịch vụ",
  "landing.terms.intro":
    "Khi tạo tài khoản hoặc sử dụng TravelPlan, bạn đồng ý với các điều khoản này.",
  "landing.terms.s1.heading": "Sử dụng dịch vụ",
  "landing.terms.s1.body":
    "TravelPlan được cung cấp nguyên trạng. Hãy dùng để lên kế hoạch cho chuyến đi của riêng bạn, không lạm dụng hoặc cố gây gián đoạn dịch vụ.",
  "landing.terms.s2.heading": "Lịch trình chỉ là gợi ý",
  "landing.terms.s2.body":
    "Lịch trình được tạo bằng AI và có thể có sai sót. Hãy kiểm tra giờ mở cửa, giá và yêu cầu đi lại trước khi dựa vào chúng.",
  "landing.terms.s3.heading": "Thay đổi",
  "landing.terms.s3.body":
    "Chúng tôi có thể cập nhật dịch vụ và các điều khoản này. Tiếp tục sử dụng sau khi thay đổi nghĩa là bạn chấp nhận điều khoản mới.",
};

export const LANDING_INFO_TRANSLATIONS = { en: EN, fr: FR, vi: VI } as const;

export const INFO_PAGE_KEYS = Object.keys(EN);
