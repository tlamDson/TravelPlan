/**
 * Three-language copy for the sign-in and sign-up pages.
 * Spread into TRANSLATIONS in useTranslationStore.
 */

type Copy = Record<string, string>;

const EN: Copy = {
  "auth.continueWithGoogle": "Continue with Google",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.showPassword": "Show password",
  "auth.hidePassword": "Hide password",

  "auth.signIn.title": "Welcome back",
  "auth.signIn.subtitle":
    "Sign in to your account to continue planning your adventures.",
  "auth.signIn.orEmail": "Or sign in with email",
  "auth.signIn.forgotPassword": "Forgot password?",
  "auth.signIn.submit": "Sign in",
  "auth.signIn.submitting": "Signing in...",
  "auth.signIn.noAccount": "Don't have an account?",
  "auth.signIn.signUpLink": "Sign up",
  "auth.signIn.panelTitle": "Start Your Adventure",
  "auth.signIn.panelBody":
    "Plan your next trip with AI-powered recommendations and smart budgeting tools.",

  "auth.signUp.title": "Create your account",
  "auth.signUp.subtitle": "Get started with your free account today.",
  "auth.signUp.orEmail": "Or sign up with email",
  "auth.signUp.firstName": "First name",
  "auth.signUp.lastName": "Last name",
  "auth.signUp.confirmPassword": "Confirm password",
  "auth.signUp.submit": "Create account",
  "auth.signUp.submitting": "Creating account...",
  "auth.signUp.agreePrefix": "By signing up, you agree to our",
  "auth.signUp.terms": "Terms",
  "auth.signUp.and": "and",
  "auth.signUp.privacy": "Privacy Policy",
  "auth.signUp.haveAccount": "Already have an account?",
  "auth.signUp.signInLink": "Sign in",
  "auth.signUp.panelTitle": "Start planning your perfect journey today",
  "auth.signUp.panelBody":
    "Join thousands of travelers who use AI to create unforgettable trips.",
  "auth.signUp.benefit.itinerary": "AI-powered itinerary generation",
  "auth.signUp.benefit.budget": "Real-time budget tracking",
  "auth.signUp.benefit.maps": "Interactive maps with route planning",
  "auth.signUp.benefit.share": "Export and share your plans",

  "auth.validation.firstNameRequired": "First name is required",
  "auth.validation.lastNameRequired": "Last name is required",
  "auth.validation.emailInvalid": "Please enter a valid email",
  "auth.validation.passwordRequired": "Password is required",
  "auth.validation.passwordMin": "Password must be at least 8 characters",
  "auth.validation.passwordMismatch": "Passwords don't match",
  "auth.validation.passwordCommon":
    "This password is too common. Choose a longer, more unique password.",
  "auth.validation.passwordWeak":
    "Password is too weak. Use upper & lowercase letters, a number, and a special character.",
  "auth.strength.0": "Very Weak",
  "auth.strength.1": "Weak",
  "auth.strength.2": "Fair",
  "auth.strength.3": "Good",
  "auth.strength.4": "Strong",
  "auth.strength.tipUppercase": "Add uppercase",
  "auth.strength.tipNumber": "Add number",
  "auth.strength.tipSymbol": "Add symbol",
  "auth.clerkError.form_password_pwned":
    "Password is too weak. Please choose a stronger password.",
  "auth.clerkError.form_password_length_too_short":
    "Password must be at least 8 characters.",
  "auth.clerkError.form_password_no_uppercase":
    "Password must contain at least one uppercase letter.",
  "auth.clerkError.form_password_no_lowercase":
    "Password must contain at least one lowercase letter.",
  "auth.clerkError.form_password_no_number":
    "Password must contain at least one number.",
  "auth.clerkError.form_identifier_exists":
    "An account with this email already exists. Try signing in instead.",
  "auth.clerkError.form_param_format_invalid":
    "Please enter a valid email address.",
  "auth.clerkError.form_param_nil": "Please fill in all required fields.",
};

const FR: Copy = {
  "auth.continueWithGoogle": "Continuer avec Google",
  "auth.email": "E-mail",
  "auth.password": "Mot de passe",
  "auth.showPassword": "Afficher le mot de passe",
  "auth.hidePassword": "Masquer le mot de passe",

  "auth.signIn.title": "Bon retour",
  "auth.signIn.subtitle":
    "Connectez-vous à votre compte pour continuer à planifier vos aventures.",
  "auth.signIn.orEmail": "Ou connectez-vous avec votre e-mail",
  "auth.signIn.forgotPassword": "Mot de passe oublié ?",
  "auth.signIn.submit": "Se connecter",
  "auth.signIn.submitting": "Connexion...",
  "auth.signIn.noAccount": "Vous n'avez pas de compte ?",
  "auth.signIn.signUpLink": "S'inscrire",
  "auth.signIn.panelTitle": "Commencez votre aventure",
  "auth.signIn.panelBody":
    "Planifiez votre prochain voyage grâce aux recommandations de l'IA et à des outils de budget intelligents.",

  "auth.signUp.title": "Créez votre compte",
  "auth.signUp.subtitle": "Commencez dès aujourd'hui avec un compte gratuit.",
  "auth.signUp.orEmail": "Ou inscrivez-vous avec votre e-mail",
  "auth.signUp.firstName": "Prénom",
  "auth.signUp.lastName": "Nom",
  "auth.signUp.confirmPassword": "Confirmer le mot de passe",
  "auth.signUp.submit": "Créer un compte",
  "auth.signUp.submitting": "Création du compte...",
  "auth.signUp.agreePrefix": "En vous inscrivant, vous acceptez nos",
  "auth.signUp.terms": "Conditions",
  "auth.signUp.and": "et notre",
  "auth.signUp.privacy": "Politique de confidentialité",
  "auth.signUp.haveAccount": "Vous avez déjà un compte ?",
  "auth.signUp.signInLink": "Se connecter",
  "auth.signUp.panelTitle":
    "Commencez à planifier votre voyage idéal dès aujourd'hui",
  "auth.signUp.panelBody":
    "Rejoignez des milliers de voyageurs qui utilisent l'IA pour créer des voyages inoubliables.",
  "auth.signUp.benefit.itinerary": "Génération d'itinéraires par l'IA",
  "auth.signUp.benefit.budget": "Suivi du budget en temps réel",
  "auth.signUp.benefit.maps":
    "Cartes interactives avec planification d'itinéraire",
  "auth.signUp.benefit.share": "Exportez et partagez vos plans",

  "auth.validation.firstNameRequired": "Le prénom est obligatoire",
  "auth.validation.lastNameRequired": "Le nom est obligatoire",
  "auth.validation.emailInvalid": "Saisissez une adresse e-mail valide",
  "auth.validation.passwordRequired": "Le mot de passe est obligatoire",
  "auth.validation.passwordMin":
    "Le mot de passe doit contenir au moins 8 caractères",
  "auth.validation.passwordMismatch": "Les mots de passe ne correspondent pas",
  "auth.validation.passwordCommon":
    "Ce mot de passe est trop courant. Choisissez un mot de passe plus long et plus unique.",
  "auth.validation.passwordWeak":
    "Mot de passe trop faible. Utilisez des majuscules et des minuscules, un chiffre et un caractère spécial.",
  "auth.strength.0": "Très faible",
  "auth.strength.1": "Faible",
  "auth.strength.2": "Moyen",
  "auth.strength.3": "Bon",
  "auth.strength.4": "Fort",
  "auth.strength.tipUppercase": "Ajoutez une majuscule",
  "auth.strength.tipNumber": "Ajoutez un chiffre",
  "auth.strength.tipSymbol": "Ajoutez un symbole",
  "auth.clerkError.form_password_pwned":
    "Mot de passe trop faible. Choisissez un mot de passe plus robuste.",
  "auth.clerkError.form_password_length_too_short":
    "Le mot de passe doit contenir au moins 8 caractères.",
  "auth.clerkError.form_password_no_uppercase":
    "Le mot de passe doit contenir au moins une majuscule.",
  "auth.clerkError.form_password_no_lowercase":
    "Le mot de passe doit contenir au moins une minuscule.",
  "auth.clerkError.form_password_no_number":
    "Le mot de passe doit contenir au moins un chiffre.",
  "auth.clerkError.form_identifier_exists":
    "Un compte existe déjà avec cet e-mail. Essayez plutôt de vous connecter.",
  "auth.clerkError.form_param_format_invalid":
    "Saisissez une adresse e-mail valide.",
  "auth.clerkError.form_param_nil": "Remplissez tous les champs obligatoires.",
};

const VI: Copy = {
  "auth.continueWithGoogle": "Tiếp tục với Google",
  "auth.email": "Email",
  "auth.password": "Mật khẩu",
  "auth.showPassword": "Hiện mật khẩu",
  "auth.hidePassword": "Ẩn mật khẩu",

  "auth.signIn.title": "Chào mừng trở lại",
  "auth.signIn.subtitle":
    "Đăng nhập vào tài khoản để tiếp tục lên kế hoạch cho chuyến đi của bạn.",
  "auth.signIn.orEmail": "Hoặc đăng nhập bằng email",
  "auth.signIn.forgotPassword": "Quên mật khẩu?",
  "auth.signIn.submit": "Đăng nhập",
  "auth.signIn.submitting": "Đang đăng nhập...",
  "auth.signIn.noAccount": "Chưa có tài khoản?",
  "auth.signIn.signUpLink": "Đăng ký",
  "auth.signIn.panelTitle": "Bắt đầu hành trình của bạn",
  "auth.signIn.panelBody":
    "Lên kế hoạch cho chuyến đi tiếp theo với gợi ý từ AI và công cụ quản lý ngân sách thông minh.",

  "auth.signUp.title": "Tạo tài khoản của bạn",
  "auth.signUp.subtitle": "Bắt đầu ngay hôm nay với tài khoản miễn phí.",
  "auth.signUp.orEmail": "Hoặc đăng ký bằng email",
  "auth.signUp.firstName": "Tên",
  "auth.signUp.lastName": "Họ",
  "auth.signUp.confirmPassword": "Xác nhận mật khẩu",
  "auth.signUp.submit": "Tạo tài khoản",
  "auth.signUp.submitting": "Đang tạo tài khoản...",
  "auth.signUp.agreePrefix": "Khi đăng ký, bạn đồng ý với",
  "auth.signUp.terms": "Điều khoản",
  "auth.signUp.and": "và",
  "auth.signUp.privacy": "Chính sách quyền riêng tư",
  "auth.signUp.haveAccount": "Đã có tài khoản?",
  "auth.signUp.signInLink": "Đăng nhập",
  "auth.signUp.panelTitle":
    "Bắt đầu lên kế hoạch cho chuyến đi hoàn hảo ngay hôm nay",
  "auth.signUp.panelBody":
    "Tham gia cùng hàng nghìn du khách đang dùng AI để tạo nên những chuyến đi khó quên.",
  "auth.signUp.benefit.itinerary": "Tạo lịch trình bằng AI",
  "auth.signUp.benefit.budget": "Theo dõi ngân sách theo thời gian thực",
  "auth.signUp.benefit.maps": "Bản đồ tương tác với lộ trình",
  "auth.signUp.benefit.share": "Xuất và chia sẻ kế hoạch",

  "auth.validation.firstNameRequired": "Vui lòng nhập tên",
  "auth.validation.lastNameRequired": "Vui lòng nhập họ",
  "auth.validation.emailInvalid": "Vui lòng nhập địa chỉ email hợp lệ",
  "auth.validation.passwordRequired": "Vui lòng nhập mật khẩu",
  "auth.validation.passwordMin": "Mật khẩu phải có ít nhất 8 ký tự",
  "auth.validation.passwordMismatch": "Mật khẩu không khớp",
  "auth.validation.passwordCommon":
    "Mật khẩu này quá phổ biến. Hãy chọn mật khẩu dài và độc đáo hơn.",
  "auth.validation.passwordWeak":
    "Mật khẩu quá yếu. Hãy dùng chữ hoa và chữ thường, một chữ số và một ký tự đặc biệt.",
  "auth.strength.0": "Rất yếu",
  "auth.strength.1": "Yếu",
  "auth.strength.2": "Trung bình",
  "auth.strength.3": "Khá",
  "auth.strength.4": "Mạnh",
  "auth.strength.tipUppercase": "Thêm chữ hoa",
  "auth.strength.tipNumber": "Thêm chữ số",
  "auth.strength.tipSymbol": "Thêm ký hiệu",
  "auth.clerkError.form_password_pwned":
    "Mật khẩu quá yếu. Vui lòng chọn mật khẩu mạnh hơn.",
  "auth.clerkError.form_password_length_too_short":
    "Mật khẩu phải có ít nhất 8 ký tự.",
  "auth.clerkError.form_password_no_uppercase":
    "Mật khẩu phải có ít nhất một chữ hoa.",
  "auth.clerkError.form_password_no_lowercase":
    "Mật khẩu phải có ít nhất một chữ thường.",
  "auth.clerkError.form_password_no_number":
    "Mật khẩu phải có ít nhất một chữ số.",
  "auth.clerkError.form_identifier_exists":
    "Email này đã có tài khoản. Hãy thử đăng nhập.",
  "auth.clerkError.form_param_format_invalid":
    "Vui lòng nhập địa chỉ email hợp lệ.",
  "auth.clerkError.form_param_nil": "Vui lòng điền đầy đủ các trường bắt buộc.",
};

export const AUTH_TRANSLATIONS = { en: EN, fr: FR, vi: VI } as const;
