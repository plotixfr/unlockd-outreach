"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NISE } from "@/lib/constants";

interface Props {
  prospect: {
    id: string;
    firmaNaziv: string;
    kontaktIme: string | null;
    kontaktPozicija: string | null;
    website: string | null;
    instagram: string | null;
    nisa: string;
    grad: string;
    opisFirme: string | null;
    kvalitetSajta: number | null;
    napomena: string | null;
  };
}

const inputCls =
  "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors";

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5";

export function ProspectEditForm({ prospect }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firmaNaziv: prospect.firmaNaziv,
    kontaktIme: prospect.kontaktIme ?? "",
    kontaktPozicija: prospect.kontaktPozicija ?? "",
    website: prospect.website ?? "",
    instagram: prospect.instagram ?? "",
    nisa: prospect.nisa,
    grad: prospect.grad,
    opisFirme: prospect.opisFirme ?? "",
    kvalitetSajta: prospect.kvalitetSajta?.toString() ?? "",
    napomena: prospect.napomena ?? "",
  });

  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/prospects/${prospect.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid server response");
      }
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push(`/prospects/${prospect.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-6 space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              Company name *
            </label>
            <input
              type="text"
              value={form.firmaNaziv}
              onChange={set("firmaNaziv")}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Niche
            </label>
            <select
              value={form.nisa}
              onChange={set("nisa")}
              className={inputCls}
            >
              {NISE.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              City
            </label>
            <input
              type="text"
              value={form.grad}
              onChange={set("grad")}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Contact name
            </label>
            <input
              type="text"
              value={form.kontaktIme}
              onChange={set("kontaktIme")}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Contact role
            </label>
            <input
              type="text"
              value={form.kontaktPozicija}
              onChange={set("kontaktPozicija")}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Website
            </label>
            <input
              type="text"
              value={form.website}
              onChange={set("website")}
              placeholder="https://..."
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Instagram
            </label>
            <input
              type="text"
              value={form.instagram}
              onChange={set("instagram")}
              placeholder="@handle"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Site quality (1-5)
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={form.kvalitetSajta}
              onChange={set("kvalitetSajta")}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Company description
          </label>
          <textarea
            rows={3}
            value={form.opisFirme}
            onChange={set("opisFirme")}
            className={inputCls + " resize-none"}
          />
        </div>
        <div>
          <label className={labelCls}>
            Internal note
          </label>
          <textarea
            rows={2}
            value={form.napomena}
            onChange={set("napomena")}
            className={inputCls + " resize-none"}
          />
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary px-5 py-2.5"
        >
          {loading && (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm transition-colors px-3 py-2.5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
