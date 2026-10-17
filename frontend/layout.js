import './globals.css';

export const metadata = {
  title: 'Stall Hub',
  description: 'Discover products in your local marketplace.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
