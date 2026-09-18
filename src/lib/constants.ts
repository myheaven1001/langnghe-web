// Shared across signup (CompleteProfileForm) and /settings/profile
// (ProfileForm) so the city list can't drift between the two forms.
export const BUYER_CITIES = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Bình Dương'];

// membership_plans.name -> display. Shared between /settings/membership
// (buyer) and /supplier/dashboard (both read the same table).
export const PLAN_ICON: Record<string, string> = { free: '🆓', basic: '⭐', premium: '👑' };
export const PLAN_LABEL: Record<string, string> = { free: 'Miễn phí', basic: 'Cơ bản', premium: 'Premium' };
