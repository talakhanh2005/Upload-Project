import './styles.css';
export const metadata = { title: 'Folio — Classroom submissions', description: 'A focused course and assignment workspace for teachers and students' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
