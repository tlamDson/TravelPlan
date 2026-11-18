/**
 * Three-language copy for the post-signup onboarding wizard.
 * Spread into TRANSLATIONS in useTranslationStore.
 */

type Copy = Record<string, string>;

const EN: Copy = {
  "onboarding.skip": "Skip for now",
  "onboarding.back": "Back",
  "onboarding.next": "Next",
  "onboarding.complete": "Complete Setup",
  "onboarding.settingUp": "Setting up...",

  "onboarding.profile.title": "Let's set up your profile",
  "onboarding.profile.subtitle":
    "Choose how your name appears publicly when sharing trips.",
  "onboarding.profile.nickname": "Public nickname / username",
  "onboarding.profile.nicknamePlaceholder": "e.g., nomad.minh",
  "onboarding.profile.currency": "Preferred currency",
  "onboarding.currency.USD": "US Dollar",
  "onboarding.currency.EUR": "Euro",
  "onboarding.currency.GBP": "British Pound",
  "onboarding.currency.JPY": "Japanese Yen",
  "onboarding.currency.CAD": "Canadian Dollar",
  "onboarding.currency.AUD": "Australian Dollar",

  "onboarding.prefs.title": "What do you love about traveling?",
  "onboarding.prefs.subtitle":
    "Select your interests to get personalized recommendations.",
  "onboarding.prefs.interests": "Your interests",
  "onboarding.prefs.travelStyle": "How do you usually travel?",
  "onboarding.interest.adventure": "Adventure",
  "onboarding.interest.culture": "Culture",
  "onboarding.interest.food": "Food & Cuisine",
  "onboarding.interest.nature": "Nature",
  "onboarding.interest.beach": "Beach",
  "onboarding.interest.city": "City Life",
  "onboarding.interest.history": "History",
  "onboarding.interest.nightlife": "Nightlife",
  "onboarding.style.solo": "Solo Traveler",
  "onboarding.style.solo.desc": "Exploring on your own",
  "onboarding.style.couple": "Couple",
  "onboarding.style.couple.desc": "Romantic getaways",
  "onboarding.style.family": "Family",
  "onboarding.style.family.desc": "Trips with kids",
  "onboarding.style.friends": "Friends",
  "onboarding.style.friends.desc": "Group adventures",

  "onboarding.trip.title": "Plan your first trip",
  "onboarding.trip.subtitle": "Where would you like to go? (optional)",
  "onboarding.trip.destination": "Destination",
  "onboarding.trip.destinationPlaceholder": "e.g., Tokyo, Japan",
  "onboarding.trip.travelers": "Number of travelers",
};

const FR: Copy = {
  "onboarding.skip": "Passer pour l'instant",
  "onboarding.back": "Retour",
  "onboarding.next": "Suivant",
  "onboarding.complete": "Terminer la configuration",
  "onboarding.settingUp": "Configuration...",

  "onboarding.profile.title": "Configurons votre profil",
  "onboarding.profile.subtitle":
    "Choisissez comment votre nom apparaît publiquement lorsque vous partagez des voyages.",
  "onboarding.profile.nickname": "Pseudo public / nom d'utilisateur",
  "onboarding.profile.nicknamePlaceholder": "ex. : nomade.minh",
  "onboarding.profile.currency": "Devise préférée",
  "onboarding.currency.USD": "Dollar américain",
  "onboarding.currency.EUR": "Euro",
  "onboarding.currency.GBP": "Livre sterling",
  "onboarding.currency.JPY": "Yen japonais",
  "onboarding.currency.CAD": "Dollar canadien",
  "onboarding.currency.AUD": "Dollar australien",

  "onboarding.prefs.title": "Qu'aimez-vous dans le voyage ?",
  "onboarding.prefs.subtitle":
    "Sélectionnez vos centres d'intérêt pour obtenir des recommandations personnalisées.",
  "onboarding.prefs.interests": "Vos centres d'intérêt",
  "onboarding.prefs.travelStyle": "Comment voyagez-vous habituellement ?",
  "onboarding.interest.adventure": "Aventure",
  "onboarding.interest.culture": "Culture",
  "onboarding.interest.food": "Gastronomie",
  "onboarding.interest.nature": "Nature",
  "onboarding.interest.beach": "Plage",
  "onboarding.interest.city": "Vie urbaine",
  "onboarding.interest.history": "Histoire",
  "onboarding.interest.nightlife": "Vie nocturne",
  "onboarding.style.solo": "Voyageur solo",
  "onboarding.style.solo.desc": "Explorer en solo",
  "onboarding.style.couple": "En couple",
  "onboarding.style.couple.desc": "Escapades romantiques",
  "onboarding.style.family": "En famille",
  "onboarding.style.family.desc": "Voyages avec des enfants",
  "onboarding.style.friends": "Entre amis",
  "onboarding.style.friends.desc": "Aventures en groupe",

  "onboarding.trip.title": "Planifiez votre premier voyage",
  "onboarding.trip.subtitle": "Où aimeriez-vous aller ? (facultatif)",
  "onboarding.trip.destination": "Destination",
  "onboarding.trip.destinationPlaceholder": "ex. : Tokyo, Japon",
  "onboarding.trip.travelers": "Nombre de voyageurs",
};

const VI: Copy = {
  "onboarding.skip": "Bỏ qua lúc này",
  "onboarding.back": "Quay lại",
  "onboarding.next": "Tiếp theo",
  "onboarding.complete": "Hoàn tất thiết lập",
  "onboarding.settingUp": "Đang thiết lập...",

  "onboarding.profile.title": "Hãy thiết lập hồ sơ của bạn",
  "onboarding.profile.subtitle":
    "Chọn cách tên của bạn hiển thị công khai khi chia sẻ chuyến đi.",
  "onboarding.profile.nickname": "Biệt danh công khai / tên người dùng",
  "onboarding.profile.nicknamePlaceholder": "VD: nomad.minh",
  "onboarding.profile.currency": "Đơn vị tiền tệ ưa thích",
  "onboarding.currency.USD": "Đô la Mỹ",
  "onboarding.currency.EUR": "Euro",
  "onboarding.currency.GBP": "Bảng Anh",
  "onboarding.currency.JPY": "Yên Nhật",
  "onboarding.currency.CAD": "Đô la Canada",
  "onboarding.currency.AUD": "Đô la Úc",

  "onboarding.prefs.title": "Bạn thích điều gì khi đi du lịch?",
  "onboarding.prefs.subtitle":
    "Chọn sở thích của bạn để nhận gợi ý được cá nhân hóa.",
  "onboarding.prefs.interests": "Sở thích của bạn",
  "onboarding.prefs.travelStyle": "Bạn thường đi du lịch như thế nào?",
  "onboarding.interest.adventure": "Phiêu lưu",
  "onboarding.interest.culture": "Văn hóa",
  "onboarding.interest.food": "Ẩm thực",
  "onboarding.interest.nature": "Thiên nhiên",
  "onboarding.interest.beach": "Biển",
  "onboarding.interest.city": "Cuộc sống đô thị",
  "onboarding.interest.history": "Lịch sử",
  "onboarding.interest.nightlife": "Cuộc sống về đêm",
  "onboarding.style.solo": "Du lịch một mình",
  "onboarding.style.solo.desc": "Tự khám phá một mình",
  "onboarding.style.couple": "Cặp đôi",
  "onboarding.style.couple.desc": "Kỳ nghỉ lãng mạn",
  "onboarding.style.family": "Gia đình",
  "onboarding.style.family.desc": "Chuyến đi cùng trẻ nhỏ",
  "onboarding.style.friends": "Bạn bè",
  "onboarding.style.friends.desc": "Chuyến phiêu lưu theo nhóm",

  "onboarding.trip.title": "Lên kế hoạch cho chuyến đi đầu tiên",
  "onboarding.trip.subtitle": "Bạn muốn đi đâu? (không bắt buộc)",
  "onboarding.trip.destination": "Điểm đến",
  "onboarding.trip.destinationPlaceholder": "VD: Tokyo, Nhật Bản",
  "onboarding.trip.travelers": "Số lượng du khách",
};

export const ONBOARDING_TRANSLATIONS = { en: EN, fr: FR, vi: VI } as const;
