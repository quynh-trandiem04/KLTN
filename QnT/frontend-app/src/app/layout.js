// frontend-app\src\app\layout.js

import './globals.css';

export const metadata = {
  title: 'E-Commerce Platform',
  description: 'Blockchain-powered e-commerce platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/assets/css/all-fontawesome.min.css" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
