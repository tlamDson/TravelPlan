/**
 * Three-language copy for every toast. Spread into TRANSLATIONS in
 * useTranslationStore; read through `toastT()` from "@/lib/toast-i18n".
 */

type Copy = Record<string, string>;

const EN: Copy = {
  "toast.profile.updated": "Profile updated",
  "toast.profile.updateFailed": "Failed to update profile",

  "toast.auth.passwordStrength":
    "Please fix password strength before continuing.",
  "toast.auth.checkEmail": "Check your email for a verification code",
  "toast.auth.unexpectedStatus":
    "Unexpected sign-up status: {status}. Please try again.",
  "toast.auth.signUpFailed": "Failed to create account. Please try again.",
  "toast.auth.accountCreated": "Account created! Welcome to TravelPlan.",
  "toast.auth.codeSent": "Verification code sent!",
  "toast.auth.resendFailed": "Failed to resend code",
  "toast.auth.googleSignUpFailed":
    "Failed to sign up with Google. Please try again.",
  "toast.auth.welcomeBack": "Welcome back!",
  "toast.auth.invalidCredentials": "Invalid email or password",
  "toast.auth.googleSignInFailed":
    "Failed to sign in with Google. Please try again.",
  "toast.auth.resetComingSoon": "Password reset feature coming soon!",
  "toast.auth.signedOut": "Signed out successfully",

  "toast.onboarding.updated": "Onboarding preferences updated successfully",
  "toast.onboarding.welcome": "Welcome to TravelPlan!",

  "toast.dashboard.upgradeCanceled":
    "Upgrade canceled. You are still on the Free plan.",
  "toast.dashboard.proWelcome":
    "Welcome to TravelPlan Pro! Your limits have been removed.",
  "toast.dashboard.upgradeProcessed":
    "Upgrade processed. Refreshing your subscription status...",
  "toast.dashboard.proToggled": "Toggled Pro mode! Reloading page...",
  "toast.dashboard.proToggleFailed": "Failed to toggle pro status",

  "toast.assistant.errorTitle": "Error",
  "toast.assistant.createSessionFailed": "Failed to create chat session",
  "toast.assistant.deleteSessionFailed": "Failed to delete chat session",
  "toast.assistant.chatFailed":
    "The assistant couldn't reply. Please try again.",

  "toast.settings.passwordFailed": "Failed to update password",

  "toast.trip.created": "Trip created successfully!",
  "toast.trip.createFailed": "Failed to create trip",
  "toast.trip.updated": "Trip updated!",
  "toast.trip.updateFailed": "Failed to update trip",
  "toast.trip.deleted": "Trip deleted",
  "toast.trip.deleteFailed": "Failed to delete trip",
  "toast.trip.budgetFailed": "Failed to update budget",
  "toast.trip.lifecycleChanged": "Trip marked as {status}",
  "toast.trip.lifecycleFailed": "Failed to update trip status",
  "toast.trip.wizardQueued": "Trip queued! Your agent is getting started.",
  "toast.trip.wizardFailed": "Failed to start trip generation",
  "toast.trip.ready": "Your trip is ready!",
  "toast.trip.itineraryFailed": "Failed to create itinerary",
  "toast.trip.retryQueued": "Retry queued. The agent is working again.",
  "toast.trip.retryFailed": "Failed to retry trip generation",
  "toast.trip.cancelled": "Trip generation cancelled.",
  "toast.trip.cancelFailed": "Failed to cancel trip generation.",
  "toast.trip.reorderFailed": "Failed to save new order. Changes reverted.",
  "toast.trip.loadingMore":
    "Loading more days... please try again in a few seconds.",
  "toast.trip.loadMoreFailed": "Could not load more days. Please try again.",

  "toast.planner.generating": "AI is generating your itinerary...",
  "toast.planner.generateStartFailed": "Failed to start itinerary generation",
  "toast.planner.generated": "Itinerary generated successfully!",
  "toast.planner.generateFailed": "Failed to generate itinerary",
  "toast.planner.optimizing": "Optimizing your route...",
  "toast.planner.optimizeStartFailed": "Failed to start route optimization",
  "toast.planner.optimized": "Route optimized!",
  "toast.planner.optimizeFailed": "Failed to optimize route",

  "toast.calendar.syncing":
    "Syncing to Google Calendar... Events will appear in a few minutes!",
  "toast.calendar.needGoogleSignIn":
    "Please sign in with a Google account to use calendar sync.",
  "toast.calendar.notEnabled": "Calendar sync is not enabled for this account.",
  "toast.calendar.syncFailed": "Could not sync to Google Calendar.",
  "toast.calendar.signIn": "Please sign in.",
  "toast.calendar.linkGoogle":
    "Please link a Google account (sign in with Google) to sync your calendar.",
  "toast.calendar.permissionUnavailable":
    "Could not request additional Calendar permissions from this browser. Update @clerk/clerk-react or check your Clerk configuration.",
  "toast.calendar.accessFailed": "Could not grant Google Calendar access.",

  "toast.regen.freeLeft":
    "You have {count} free regeneration left for this trip.",
  "toast.regen.replaced": "Activity replaced with a new suggestion!",
  "toast.regen.notUnique": "Could not find a unique replacement. Try again.",

  "toast.auth.signInFailed": "Failed to sign in. Please try again.",
  "toast.authError.form_password_pwned":
    "Password is too weak. Please choose a stronger password.",
  "toast.authError.form_password_length_too_short":
    "Password must be at least 8 characters.",
  "toast.authError.form_password_no_uppercase":
    "Password must contain at least one uppercase letter.",
  "toast.authError.form_password_no_lowercase":
    "Password must contain at least one lowercase letter.",
  "toast.authError.form_password_no_number":
    "Password must contain at least one number.",
  "toast.authError.form_identifier_exists":
    "An account with this email already exists. Try signing in instead.",
  "toast.authError.form_param_format_invalid":
    "Please enter a valid email address.",
  "toast.authError.form_param_nil": "Please fill in all required fields.",
  "toast.authError.form_password_incorrect": "Invalid email or password",
  "toast.authError.form_identifier_not_found": "Invalid email or password",
};

const FR: Copy = {
  "toast.profile.updated": "Profil mis à jour",
  "toast.profile.updateFailed": "Échec de la mise à jour du profil",

  "toast.auth.passwordStrength":
    "Veuillez renforcer votre mot de passe avant de continuer.",
  "toast.auth.checkEmail":
    "Consultez votre e-mail pour le code de vérification",
  "toast.auth.unexpectedStatus":
    "Statut d'inscription inattendu : {status}. Veuillez réessayer.",
  "toast.auth.signUpFailed":
    "Échec de la création du compte. Veuillez réessayer.",
  "toast.auth.accountCreated": "Compte créé ! Bienvenue sur TravelPlan.",
  "toast.auth.codeSent": "Code de vérification envoyé !",
  "toast.auth.resendFailed": "Échec du renvoi du code",
  "toast.auth.googleSignUpFailed":
    "Échec de l'inscription avec Google. Veuillez réessayer.",
  "toast.auth.welcomeBack": "Bon retour !",
  "toast.auth.invalidCredentials": "E-mail ou mot de passe invalide",
  "toast.auth.googleSignInFailed":
    "Échec de la connexion avec Google. Veuillez réessayer.",
  "toast.auth.resetComingSoon":
    "La réinitialisation du mot de passe arrive bientôt !",
  "toast.auth.signedOut": "Déconnexion réussie",

  "toast.onboarding.updated": "Préférences d'accueil mises à jour avec succès",
  "toast.onboarding.welcome": "Bienvenue sur TravelPlan !",

  "toast.dashboard.upgradeCanceled":
    "Mise à niveau annulée. Vous restez sur l'offre gratuite.",
  "toast.dashboard.proWelcome":
    "Bienvenue sur TravelPlan Pro ! Vos limites ont été levées.",
  "toast.dashboard.upgradeProcessed":
    "Mise à niveau traitée. Actualisation de votre abonnement...",
  "toast.dashboard.proToggled": "Mode Pro basculé ! Rechargement de la page...",
  "toast.dashboard.proToggleFailed": "Échec du changement de statut Pro",

  "toast.assistant.errorTitle": "Erreur",
  "toast.assistant.createSessionFailed":
    "Échec de la création de la session de chat",
  "toast.assistant.deleteSessionFailed":
    "Échec de la suppression de la session de chat",
  "toast.assistant.chatFailed":
    "L'assistant n'a pas pu répondre. Veuillez réessayer.",

  "toast.settings.passwordFailed": "Échec de la mise à jour du mot de passe",

  "toast.trip.created": "Voyage créé avec succès !",
  "toast.trip.createFailed": "Échec de la création du voyage",
  "toast.trip.updated": "Voyage mis à jour !",
  "toast.trip.updateFailed": "Échec de la mise à jour du voyage",
  "toast.trip.deleted": "Voyage supprimé",
  "toast.trip.deleteFailed": "Échec de la suppression du voyage",
  "toast.trip.budgetFailed": "Échec de la mise à jour du budget",
  "toast.trip.lifecycleChanged": "Voyage marqué comme : {status}",
  "toast.trip.lifecycleFailed": "Échec de la mise à jour du statut du voyage",
  "toast.trip.wizardQueued": "Voyage en file d'attente ! Votre agent démarre.",
  "toast.trip.wizardFailed": "Échec du lancement de la génération du voyage",
  "toast.trip.ready": "Votre voyage est prêt !",
  "toast.trip.itineraryFailed": "Échec de la création de l'itinéraire",
  "toast.trip.retryQueued":
    "Nouvel essai en file d'attente. L'agent reprend le travail.",
  "toast.trip.retryFailed": "Échec du nouvel essai de génération du voyage",
  "toast.trip.cancelled": "Génération du voyage annulée.",
  "toast.trip.cancelFailed":
    "Échec de l'annulation de la génération du voyage.",
  "toast.trip.reorderFailed":
    "Échec de l'enregistrement du nouvel ordre. Modifications annulées.",
  "toast.trip.loadingMore":
    "Chargement de jours supplémentaires... réessayez dans quelques secondes.",
  "toast.trip.loadMoreFailed":
    "Impossible de charger plus de jours. Veuillez réessayer.",

  "toast.planner.generating": "L'IA génère votre itinéraire...",
  "toast.planner.generateStartFailed":
    "Échec du lancement de la génération de l'itinéraire",
  "toast.planner.generated": "Itinéraire généré avec succès !",
  "toast.planner.generateFailed": "Échec de la génération de l'itinéraire",
  "toast.planner.optimizing": "Optimisation de votre parcours...",
  "toast.planner.optimizeStartFailed":
    "Échec du lancement de l'optimisation du parcours",
  "toast.planner.optimized": "Parcours optimisé !",
  "toast.planner.optimizeFailed": "Échec de l'optimisation du parcours",

  "toast.calendar.syncing":
    "Synchronisation avec Google Agenda... Les événements apparaîtront dans quelques minutes !",
  "toast.calendar.needGoogleSignIn":
    "Connectez-vous avec un compte Google pour utiliser la synchronisation de l'agenda.",
  "toast.calendar.notEnabled":
    "La synchronisation de l'agenda n'est pas activée pour ce compte.",
  "toast.calendar.syncFailed": "Impossible de synchroniser avec Google Agenda.",
  "toast.calendar.signIn": "Veuillez vous connecter.",
  "toast.calendar.linkGoogle":
    "Liez un compte Google (connexion avec Google) pour synchroniser votre agenda.",
  "toast.calendar.permissionUnavailable":
    "Impossible de demander les autorisations Agenda supplémentaires depuis ce navigateur. Mettez à jour @clerk/clerk-react ou vérifiez votre configuration Clerk.",
  "toast.calendar.accessFailed":
    "Impossible d'accorder l'accès à Google Agenda.",

  "toast.regen.freeLeft":
    "Il vous reste {count} régénération gratuite pour ce voyage.",
  "toast.regen.replaced": "Activité remplacée par une nouvelle suggestion !",
  "toast.regen.notUnique":
    "Impossible de trouver un remplacement unique. Réessayez.",

  "toast.auth.signInFailed": "Échec de la connexion. Veuillez réessayer.",
  "toast.authError.form_password_pwned":
    "Mot de passe trop faible. Choisissez-en un plus robuste.",
  "toast.authError.form_password_length_too_short":
    "Le mot de passe doit contenir au moins 8 caractères.",
  "toast.authError.form_password_no_uppercase":
    "Le mot de passe doit contenir au moins une majuscule.",
  "toast.authError.form_password_no_lowercase":
    "Le mot de passe doit contenir au moins une minuscule.",
  "toast.authError.form_password_no_number":
    "Le mot de passe doit contenir au moins un chiffre.",
  "toast.authError.form_identifier_exists":
    "Un compte existe déjà avec cet e-mail. Essayez de vous connecter.",
  "toast.authError.form_param_format_invalid":
    "Veuillez saisir une adresse e-mail valide.",
  "toast.authError.form_param_nil":
    "Veuillez remplir tous les champs obligatoires.",
  "toast.authError.form_password_incorrect": "E-mail ou mot de passe invalide",
  "toast.authError.form_identifier_not_found":
    "E-mail ou mot de passe invalide",
};

const VI: Copy = {
  "toast.profile.updated": "Đã cập nhật hồ sơ",
  "toast.profile.updateFailed": "Không thể cập nhật hồ sơ",

  "toast.auth.passwordStrength":
    "Vui lòng đặt mật khẩu mạnh hơn trước khi tiếp tục.",
  "toast.auth.checkEmail": "Hãy kiểm tra email để lấy mã xác minh",
  "toast.auth.unexpectedStatus":
    "Trạng thái đăng ký không như mong đợi: {status}. Vui lòng thử lại.",
  "toast.auth.signUpFailed": "Không thể tạo tài khoản. Vui lòng thử lại.",
  "toast.auth.accountCreated":
    "Đã tạo tài khoản! Chào mừng bạn đến với TravelPlan.",
  "toast.auth.codeSent": "Đã gửi mã xác minh!",
  "toast.auth.resendFailed": "Không thể gửi lại mã",
  "toast.auth.googleSignUpFailed":
    "Không thể đăng ký bằng Google. Vui lòng thử lại.",
  "toast.auth.welcomeBack": "Chào mừng bạn quay lại!",
  "toast.auth.invalidCredentials": "Email hoặc mật khẩu không đúng",
  "toast.auth.googleSignInFailed":
    "Không thể đăng nhập bằng Google. Vui lòng thử lại.",
  "toast.auth.resetComingSoon": "Tính năng đặt lại mật khẩu sắp ra mắt!",
  "toast.auth.signedOut": "Đã đăng xuất",

  "toast.onboarding.updated": "Đã cập nhật tùy chọn ban đầu",
  "toast.onboarding.welcome": "Chào mừng bạn đến với TravelPlan!",

  "toast.dashboard.upgradeCanceled":
    "Đã hủy nâng cấp. Bạn vẫn đang dùng gói miễn phí.",
  "toast.dashboard.proWelcome":
    "Chào mừng bạn đến với TravelPlan Pro! Các giới hạn đã được gỡ bỏ.",
  "toast.dashboard.upgradeProcessed":
    "Đã xử lý nâng cấp. Đang làm mới trạng thái gói của bạn...",
  "toast.dashboard.proToggled": "Đã chuyển chế độ Pro! Đang tải lại trang...",
  "toast.dashboard.proToggleFailed": "Không thể chuyển trạng thái Pro",

  "toast.assistant.errorTitle": "Lỗi",
  "toast.assistant.createSessionFailed": "Không thể tạo phiên trò chuyện",
  "toast.assistant.deleteSessionFailed": "Không thể xóa phiên trò chuyện",
  "toast.assistant.chatFailed": "Trợ lý không thể trả lời. Vui lòng thử lại.",

  "toast.settings.passwordFailed": "Không thể cập nhật mật khẩu",

  "toast.trip.created": "Đã tạo chuyến đi!",
  "toast.trip.createFailed": "Không thể tạo chuyến đi",
  "toast.trip.updated": "Đã cập nhật chuyến đi!",
  "toast.trip.updateFailed": "Không thể cập nhật chuyến đi",
  "toast.trip.deleted": "Đã xóa chuyến đi",
  "toast.trip.deleteFailed": "Không thể xóa chuyến đi",
  "toast.trip.budgetFailed": "Không thể cập nhật ngân sách",
  "toast.trip.lifecycleChanged": "Đã chuyển chuyến đi sang: {status}",
  "toast.trip.lifecycleFailed": "Không thể cập nhật trạng thái chuyến đi",
  "toast.trip.wizardQueued":
    "Chuyến đi đã vào hàng đợi! Trợ lý của bạn đang bắt đầu.",
  "toast.trip.wizardFailed": "Không thể bắt đầu tạo chuyến đi",
  "toast.trip.ready": "Chuyến đi của bạn đã sẵn sàng!",
  "toast.trip.itineraryFailed": "Không thể tạo lịch trình",
  "toast.trip.retryQueued": "Đã xếp hàng thử lại. Trợ lý đang làm việc lại.",
  "toast.trip.retryFailed": "Không thể thử lại việc tạo chuyến đi",
  "toast.trip.cancelled": "Đã hủy việc tạo chuyến đi.",
  "toast.trip.cancelFailed": "Không thể hủy việc tạo chuyến đi.",
  "toast.trip.reorderFailed":
    "Không thể lưu thứ tự mới. Các thay đổi đã được hoàn tác.",
  "toast.trip.loadingMore":
    "Đang tải thêm ngày... vui lòng thử lại sau vài giây.",
  "toast.trip.loadMoreFailed": "Không thể tải thêm ngày. Vui lòng thử lại.",

  "toast.planner.generating": "AI đang tạo lịch trình của bạn...",
  "toast.planner.generateStartFailed": "Không thể bắt đầu tạo lịch trình",
  "toast.planner.generated": "Đã tạo lịch trình!",
  "toast.planner.generateFailed": "Không thể tạo lịch trình",
  "toast.planner.optimizing": "Đang tối ưu lộ trình của bạn...",
  "toast.planner.optimizeStartFailed": "Không thể bắt đầu tối ưu lộ trình",
  "toast.planner.optimized": "Đã tối ưu lộ trình!",
  "toast.planner.optimizeFailed": "Không thể tối ưu lộ trình",

  "toast.calendar.syncing":
    "Đang đồng bộ với lịch Google... Sự kiện sẽ xuất hiện sau vài phút!",
  "toast.calendar.needGoogleSignIn":
    "Vui lòng đăng nhập bằng tài khoản Google để dùng đồng bộ lịch.",
  "toast.calendar.notEnabled": "Tài khoản này chưa bật đồng bộ lịch.",
  "toast.calendar.syncFailed": "Không thể đồng bộ với lịch Google.",
  "toast.calendar.signIn": "Vui lòng đăng nhập.",
  "toast.calendar.linkGoogle":
    "Vui lòng liên kết tài khoản Google (đăng nhập bằng Google) để đồng bộ lịch.",
  "toast.calendar.permissionUnavailable":
    "Không thể yêu cầu thêm quyền truy cập lịch từ trình duyệt này. Hãy cập nhật @clerk/clerk-react hoặc kiểm tra cấu hình Clerk.",
  "toast.calendar.accessFailed": "Không thể cấp quyền truy cập lịch Google.",

  "toast.regen.freeLeft":
    "Bạn còn {count} lượt tạo lại miễn phí cho chuyến đi này.",
  "toast.regen.replaced": "Đã thay hoạt động bằng một gợi ý mới!",
  "toast.regen.notUnique":
    "Không tìm được hoạt động thay thế phù hợp. Hãy thử lại.",

  "toast.auth.signInFailed": "Không thể đăng nhập. Vui lòng thử lại.",
  "toast.authError.form_password_pwned":
    "Mật khẩu quá yếu. Vui lòng chọn mật khẩu mạnh hơn.",
  "toast.authError.form_password_length_too_short":
    "Mật khẩu phải có ít nhất 8 ký tự.",
  "toast.authError.form_password_no_uppercase":
    "Mật khẩu phải có ít nhất một chữ hoa.",
  "toast.authError.form_password_no_lowercase":
    "Mật khẩu phải có ít nhất một chữ thường.",
  "toast.authError.form_password_no_number":
    "Mật khẩu phải có ít nhất một chữ số.",
  "toast.authError.form_identifier_exists":
    "Đã có tài khoản dùng email này. Hãy thử đăng nhập.",
  "toast.authError.form_param_format_invalid":
    "Vui lòng nhập địa chỉ email hợp lệ.",
  "toast.authError.form_param_nil": "Vui lòng điền đầy đủ các trường bắt buộc.",
  "toast.authError.form_password_incorrect": "Email hoặc mật khẩu không đúng",
  "toast.authError.form_identifier_not_found": "Email hoặc mật khẩu không đúng",
};

export const TOAST_TRANSLATIONS = { en: EN, fr: FR, vi: VI } as const;
