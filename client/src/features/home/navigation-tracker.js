/**
 * Ref theo dõi vị trí router hiện thời từ App để chống điều hướng cưỡng bức
 * khi người dùng đã chuyển trang trong lúc đăng xuất đang pending.
 * @type {{ current: import('react-router').Location | null }}
 */
export const activeLocationRef = { current: null };
