// Sổ địa chỉ giao hàng của buyer (bảng buyer_addresses — kế hoạch 3.2).

export interface BuyerAddress {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  ward: string;
  district: string;
  province: string;
  is_default: boolean;
}

// "12 Phố Gốm, Phường Bát Tràng, Hà Nội" — cùng thứ tự accept_quote() chép
// vào orders.shipping_address.
export function formatAddressLine(
  a: Pick<BuyerAddress, 'address_line' | 'ward' | 'district' | 'province'>,
) {
  return [a.address_line, a.ward, a.district, a.province]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}
