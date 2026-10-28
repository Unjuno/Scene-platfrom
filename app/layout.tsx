import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'SCENE — 物語が、幕を開ける。',description:'同じ絵、違う声、広がる物語。静止画と台本でつくり、声で参加する創作の劇場。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
