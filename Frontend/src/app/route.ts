import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

// Sert la vitrine Soft&Cosy (HTML/CSS/JS statique) à la racine du domaine.
// Un Route Handler renvoie le document brut au navigateur (pas de passage par
// React/dangerouslySetInnerHTML), donc le <script> inline du site s'exécute
// normalement — contrairement à une injection via innerHTML qui l'aurait bloqué.
export async function GET() {
  const filePath = path.join(process.cwd(), 'site', 'index.html');
  const html = await readFile(filePath, 'utf-8');

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
