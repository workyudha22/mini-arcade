# Mini Arcade

Tujuh game neon untuk satu tangan: putar, tumpuk, hancurkan, susun, bertahan,
pecahkan, terbangkan. Tanpa login, tanpa backend. Skor terbaik tersimpan di perangkat lewat
`localStorage`.

## Jalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Build produksi: `npm run build`, lalu
`npm run preview`.

## Game

- **Neon Tunnel** — geser kiri/kanan untuk memutar orbit. Lewati celah gerbang;
  makin dekat ke tengah celah makin besar bonus combo. Tiap 8 gerbang naik
  level: kecepatan dan poin ikut naik. Satu sentuhan bilah mengakhiri
  permainan.
- **Stack / Tower** — tap (atau Space) untuk menjatuhkan balok. Bagian yang
  meleset terpotong; semakin presisi, semakin lebar balok tersisa. Tiap 6 balok
  naik level dan poin ikut naik.
- **Smash / 30s** — tap kubus untuk memecahkannya dalam 30 detik. Kubus emas
  menambah 2 detik, bom merah memotong 3 detik. Level naik tiap 6 detik dan
  pengali poin ikut naik.
- **Blockfall** — geser, tap untuk memutar, swipe ke bawah untuk menjatuhkan.
  Sapu baris untuk naik level; tiap level jatuh makin cepat dan poin makin
  besar. Permainan berakhir saat tumpukan menyentuh langit. Desktop: panah, X,
  dan Space.
- **Void Raiders** — geser kapal, tembakan otomatis. Hindari proyektil dan
  bertahan dari gelombang invasor tanpa batas waktu. Tiap level makin cepat dan
  skor makin besar; emas memberi bonus.
- **Prism Break** — geser paddle, pantulkan bola, pecahkan semua prisma neon.
  Tiap level bola makin cepat dan susunan makin padat. Tiga bola; skor makin
  besar di level tinggi. Desktop: panah atau mouse.
- **Sky Strike** — pesawat hover-blade futuristik menembak otomatis. Lima bentuk
  senjata (LANCE, NOVA, SEEKER, RAIL, RING, WHIP) dengan level pola sampai 10 —
  setiap pickup senjata menaikkan level dan mengacak ulang bentuknya. Setiap
  level berakhir dengan raja berbeda (6 raja: Meteor, Sayap, Bombardir, Void,
  Badai, Mahkota) yang serangannya makin ganas; kalahkan raja untuk naik level.
  Hancurkan meteor, pesawat tempur, drone, bomber, dan turret untuk
  menjatuhkan darah, senjata, dan perisai. Desktop: panah atau WASD.

## Deploy

Produksi: <https://mini-arcade-neon.pages.dev/>

```bash
npm run deploy
```

`npm run deploy` menjalankan build lalu mengunggah `dist/` ke Cloudflare Pages
(proyek `mini-arcade-neon`, branch `main`). Login sekali dengan
`npx wrangler login` sebelum deploy pertama. Routing memakai hash (`/#blockfall`),
jadi tidak perlu fallback SPA.

## Teknis

Vite + TypeScript strict + Three.js (WebGL), tanpa framework UI. Audio dibuat
prosedural dengan WebAudio (tanpa file aset). Tiap game punya loop render,
particle system, dan pembersihan WebGL sendiri supaya berpindah game tidak
membocorkan context.

## Tantangan harian

Panel **Tantangan Harian** memakai seed tanggal: layout Neon Tunnel, urutan
spawn Smash, urutan balok Blockfall, pola tembakan Void Raiders, dan susunan
prisma Prism Break sama untuk semua orang pada hari yang sama. Selesaikan semua
game untuk menjaga streak; progres dan rekor harian disimpan terpisah dari rekor
sepanjang masa. Streak putus kalau satu hari terlewat.
