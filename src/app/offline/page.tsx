import { WifiOff } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 text-center">
      <div className="bg-[#111111] border border-[#222222] p-8 rounded-2xl shadow-xl max-w-md w-full flex flex-col items-center">
        <div className="h-20 w-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <WifiOff className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">You are offline</h1>
        <p className="text-gray-400 mb-8">
          It looks like you've lost your internet connection. Some features of Money OS are unavailable while offline.
        </p>
        <Link 
          href="/" 
          className="bg-white text-black font-medium py-2.5 px-6 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Try Again
        </Link>
      </div>
    </div>
  );
}
