'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { adminErrorMessage } from '../../../_lib/errors';

// Chỉnh điểm uy tín / rủi ro của một hồ sơ qua RPC admin_adjust_score()
// (kế hoạch 4.10): bắt buộc lý do, có nhật ký.
export function ScoreForm({
  profileType,
  profileId,
  trustScore,
  riskScore,
}: {
  profileType: 'buyer' | 'supplier';
  profileId: string;
  trustScore: number;
  riskScore: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [trust, setTrust] = useState(String(trustScore));
  const [risk, setRisk] = useState(String(riskScore));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = Number(trust);
    const r = Number(risk);
    if (![t, r].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) {
      setResult({ ok: false, message: 'Điểm phải là số nguyên từ 0 đến 100.' });
      return;
    }
    if (t === trustScore && r === riskScore) {
      setResult({ ok: false, message: 'Điểm chưa thay đổi.' });
      return;
    }
    if (!reason.trim()) {
      setResult({ ok: false, message: 'Vui lòng ghi lý do.' });
      return;
    }
    setBusy(true);
    setResult(null);
    const { error } = await supabase.rpc('admin_adjust_score', {
      p_profile_type: profileType,
      p_profile_id: profileId,
      p_trust_score: t === trustScore ? null : t,
      p_risk_score: r === riskScore ? null : r,
      p_reason: reason,
    });
    setBusy(false);
    if (error) {
      setResult({ ok: false, message: adminErrorMessage(error.message, 'Không lưu được điểm.') });
      return;
    }
    setReason('');
    setResult({ ok: true, message: 'Đã cập nhật điểm.' });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Điểm uy tín (0–100)">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={trust}
            onChange={(e) => setTrust(e.target.value)}
          />
        </Field>
        <Field label="Điểm rủi ro (0–100)">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Lý do" required>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="VD: Giao trễ 3 đơn liên tiếp"
        />
      </Field>
      {result && (
        <div
          role="status"
          className={`text-[13px] ${result.ok ? 'text-status-green font-semibold' : 'text-brand-red'}`}
        >
          {result.message}
        </div>
      )}
      <div>
        <Button type="submit" variant="forest" disabled={busy}>
          {busy ? 'Đang lưu...' : 'Lưu điểm'}
        </Button>
      </div>
    </form>
  );
}

// Cộng / trừ credit RFQ của buyer qua RPC admin_grant_credit().
export function CreditForm({ buyerId, balance }: { buyerId: string; balance: number }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const n = Number(amount);
  const valid = Number.isInteger(n) && n !== 0 && n >= -1000 && n <= 1000;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setResult({ ok: false, message: 'Nhập số credit khác 0 (số âm để trừ), tối đa 1000.' });
      return;
    }
    if (balance + n < 0) {
      setResult({ ok: false, message: `Buyer chỉ còn ${balance} credit.` });
      return;
    }
    if (!reason.trim()) {
      setResult({ ok: false, message: 'Vui lòng ghi lý do.' });
      return;
    }
    setBusy(true);
    setResult(null);
    const { error } = await supabase.rpc('admin_grant_credit', {
      p_buyer_id: buyerId,
      p_amount: n,
      p_reason: reason,
    });
    setBusy(false);
    if (error) {
      setResult({
        ok: false,
        message: adminErrorMessage(error.message, 'Không cập nhật được credit.'),
      });
      return;
    }
    setAmount('');
    setReason('');
    setResult({ ok: true, message: n > 0 ? `Đã cộng ${n} credit.` : `Đã trừ ${-n} credit.` });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="text-[13px]">
        Số dư hiện tại: <strong>{balance}</strong> credit
        {valid && balance + n >= 0 && (
          <span className="text-brand-sub"> → sau khi lưu: {balance + n}</span>
        )}
      </div>
      <Field label="Số credit" hint="Số dương để cộng, số âm để trừ.">
        <Input
          type="number"
          inputMode="numeric"
          min={-1000}
          max={1000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="VD: 10 hoặc -3"
        />
      </Field>
      <Field label="Lý do" required>
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="VD: Tặng khách mới"
        />
      </Field>
      {result && (
        <div
          role="status"
          className={`text-[13px] ${result.ok ? 'text-status-green font-semibold' : 'text-brand-red'}`}
        >
          {result.message}
        </div>
      )}
      <div>
        <Button type="submit" variant="forest" disabled={busy}>
          {busy ? 'Đang lưu...' : 'Lưu credit'}
        </Button>
      </div>
    </form>
  );
}
