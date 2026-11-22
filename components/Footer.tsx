export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/8 px-4 py-6 text-center text-[12px] leading-relaxed text-white/45">
      <p>Designed and developed by Adi Binsheraz</p>
      <div className="mt-2.5 flex items-center justify-center gap-3">
        <a
          className="inline-flex items-center justify-center rounded-full p-2 transition-all duration-200 hover:scale-110 bg-white/5 border border-white/10 hover:border-accent/40 hover:bg-white/10 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          href="https://instagram.com/adibinsheraz"
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          title="Instagram (@adibinsheraz)"
        >
          <img src="/instagram.png" alt="Instagram" className="h-5 w-5 object-contain" />
        </a>
        <a
          className="inline-flex items-center justify-center rounded-full p-2 transition-all duration-200 hover:scale-110 bg-white/5 border border-white/10 hover:border-accent/40 hover:bg-white/10 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          href="mailto:adi.binsheraz@gmail.com"
          aria-label="Gmail"
          title="Gmail (adi.binsheraz@gmail.com)"
        >
          <img src="/gmail.png" alt="Gmail" className="h-5 w-5 object-contain" />
        </a>
      </div>
      <p className="mt-2 text-white/30">© 2026 ASCII. All rights reserved.</p>
    </footer>
  );
}
