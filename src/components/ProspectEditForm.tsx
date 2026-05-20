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
  "w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors placeholder-zinc-700";

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
      if (!res.ok) throw new Error(data.error || "Error čuvanju");
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
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6 space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
              Naziv firme *
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
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
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
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
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
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
              Kontakt ime
            </label>
            <input
              type="text"
              value={form.kontaktIme}
              onChange={set("kontaktIme")}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
              Pozicija kontakta
            </label>
            <input
              type="text"
              value={form.kontaktPozicija}
              onChange={set("kontaktPozicija")}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
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
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
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
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
              Kvalitet sajta (1-5)
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
          <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
            Opis firme
          </label>
          <textarea
            rows={3}
            value={form.opisFirme}
            onChange={set("opisFirme")}
            className={inputCls + " resize-none"}
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
            Napomena
          </label>
          <textarea
            rows={2}
            value={form.napomena}
            onChange={set("napomena")}
            className={inputCls + " resize-none"}
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading && (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Čuvanje..." : "Save izmjene"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors px-3 py-2.5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
