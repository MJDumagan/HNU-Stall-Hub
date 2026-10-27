import './globals.css';

export const metadata = {
  title: 'HNU StallHub',
  description: 'Browse campus cafeteria stalls and order from HNU.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
