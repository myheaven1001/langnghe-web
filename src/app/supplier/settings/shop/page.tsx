import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, Card, CardBody, CardHeader } from '@/components/ui';
import { buildSupplierNavGroups } from '../../_lib/nav';
import { getNewRfqCount, getUnreadNotificationCount } from '../../_lib/counts';
import { ShopSettingsForm } from './_components/ShopSettingsForm';
import { VisibilityToggles } from './_components/VisibilityToggles';

export const metadata: Metadata = {
  title: 'Cài đặt gian hàng — LàngNghề.vn',
};

export default async function SupplierShopSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: supplier } = await supabase
    .from('supplier_profiles')
    .select(
      'id, shop_name, village_origin, rating_avg, logo_url, banner_url, contact_phone, contact_zalo, working_hours, website_url, show_phone_public, show_address_public, allow_direct_message, is_hidden, preferred_carriers, default_processing_days',
    )
    .eq('user_id', user.id)
    .single();

  if (!supplier) redirect('/');

  const [newRfqCount, unreadCount] = await Promise.all([
    getNewRfqCount(supabase, supplier.id),
    getUnreadNotificationCount(supabase, user.id),
  ]);

  return (
    <AppShell
      header={{
        icons: [
          { icon: '💬', title: 'Tin nhắn' },
          { icon: '🔔', title: 'Thông báo', badge: unreadCount || undefined },
        ],
        userName: supplier.shop_name,
        userRole: 'Supplier',
      }}
      navGroups={buildSupplierNavGroups({ newRfqCount, unreadCount })}
    >
      <div className="text-brand-light mb-2 flex items-center gap-1.5 text-[11.5px]">
        <Link href="/supplier/dashboard" className="text-brand-sub hover:text-brand-red">
          Dashboard
        </Link>
        <span>/</span>
        <span>Cài đặt gian hàng</span>
      </div>

      <div className="mb-[18px]">
        <div className="text-xl font-bold">Cài đặt gian hàng</div>
        <div className="text-brand-sub mt-1 text-[12.5px]">
          Tùy chỉnh giao diện và thông tin công khai của gian hàng bạn trên LàngNghề.vn.
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        {/* LEFT */}
        <div>
          <Card>
            <CardHeader title={<>🖼️ Logo, banner & thông tin liên hệ</>} />
            <CardBody padded>
              <ShopSettingsForm
                userId={user.id}
                supplierId={supplier.id}
                logoUrl={supplier.logo_url}
                bannerUrl={supplier.banner_url}
                contactPhone={supplier.contact_phone}
                contactZalo={supplier.contact_zalo}
                workingHours={supplier.working_hours}
                websiteUrl={supplier.website_url}
                preferredCarriers={supplier.preferred_carriers ?? []}
                defaultProcessingDays={supplier.default_processing_days}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>👁️ Hiển thị gian hàng</>} />
            <CardBody padded>
              <VisibilityToggles
                supplierId={supplier.id}
                initial={{
                  show_phone_public: supplier.show_phone_public,
                  show_address_public: supplier.show_address_public,
                  allow_direct_message: supplier.allow_direct_message,
                  is_hidden: supplier.is_hidden,
                }}
              />
            </CardBody>
          </Card>
        </div>

        {/* RIGHT RAIL — LIVE PREVIEW */}
        <div>
          <div className="border-brand-border sticky top-[72px] mb-4 overflow-hidden rounded-[10px] border bg-white">
            <div className="text-brand-sub px-4 pt-4 pb-2.5 text-xs font-bold tracking-[.04em] uppercase">
              Xem trước gian hàng
            </div>
            <div
              className="h-16"
              style={{
                background: supplier.banner_url
                  ? `url(${supplier.banner_url}) center/cover`
                  : 'linear-gradient(120deg,#1A3A2A,#2d5a3d)',
              }}
            />
            <div className="-mt-6 px-4 pb-4">
              <div className="bg-brand-red mb-2 flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[10px] border-[3px] border-white text-xl text-white">
                {supplier.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL
                  <img src={supplier.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  '🏭'
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[13.5px] font-bold">{supplier.shop_name}</div>
              <div className="text-brand-light mt-0.5 text-[11px]">
                {supplier.village_origin ?? 'Chưa rõ làng nghề'}
                {supplier.rating_avg ? ` · ${supplier.rating_avg.toFixed(1)}★` : ''}
              </div>
              {(supplier.contact_phone || supplier.contact_zalo || supplier.working_hours) && (
                <div className="text-brand-sub mt-2.5 border-t border-[#F2F0EC] pt-2.5 text-[11.5px] leading-loose">
                  {supplier.contact_phone && <div>📞 {supplier.contact_phone}</div>}
                  {supplier.contact_zalo && <div>💬 Zalo: {supplier.contact_zalo}</div>}
                  {supplier.working_hours && <div>🕐 {supplier.working_hours}</div>}
                </div>
              )}
            </div>
          </div>

          <div className="text-brand-sub mb-2.5 flex gap-2 px-1 text-xs leading-relaxed">
            <span>🎯</span>
            <span>Gian hàng có logo + banner đầy đủ giúp buyer tin tưởng gửi RFQ hơn.</span>
          </div>
          <div className="text-brand-sub flex gap-2 px-1 text-xs leading-relaxed">
            <span>📞</span>
            <span>Bật hotline công khai giúp buyer liên hệ nhanh với đơn hàng gấp.</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
