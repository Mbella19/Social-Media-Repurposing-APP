import { useState, useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { SiTiktok, SiInstagram, SiFacebook, SiYoutube } from "react-icons/si";

const platforms = [
  {
    name: "TikTok",
    icon: SiTiktok,
    color: "from-[#000000] to-[#00f2ea]",
    aspectRatio: "9/16",
    bgGradient: "from-black to-gray-900",
    videoSrc: "/vids/instagram_tiktok_youtube_shorts.mp4",
  },
  {
    name: "Instagram",
    icon: SiInstagram,
    color: "from-[#f09433] via-[#dc2743] to-[#bc1888]",
    aspectRatio: "9/16",
    bgGradient: "from-pink-500 to-purple-600",
    videoSrc: "/vids/instagram_tiktok_youtube_shorts.mp4",
  },
  {
    name: "YouTube Shorts",
    icon: SiYoutube,
    color: "from-[#ff0000] to-[#cc0000]",
    aspectRatio: "9/16",
    bgGradient: "from-red-600 to-red-700",
    videoSrc: "/vids/instagram_tiktok_youtube_shorts.mp4",
  },
  {
    name: "Facebook",
    icon: SiFacebook,
    color: "from-[#1877f2] to-[#0c63d4]",
    aspectRatio: "1/1",
    bgGradient: "from-blue-600 to-blue-700",
    videoSrc: "/vids/facebook.mp4",
  },
];

export function PlatformShowcase() {
  const [activeVideoIndex, setActiveVideoIndex] = useState(-1); // -1 for source video
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const platformVideoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    // Play source video first
    if (sourceVideoRef.current) {
      sourceVideoRef.current.currentTime = 0;
      sourceVideoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
    }
  }, []);

  const handleVideoEnded = (videoIndex: number) => {
    // Move to next video
    const nextIndex = videoIndex + 1;
    
    if (nextIndex >= platforms.length) {
      // Loop back to source video
      setActiveVideoIndex(-1);
      if (sourceVideoRef.current) {
        sourceVideoRef.current.currentTime = 0;
        sourceVideoRef.current.play().catch(e => console.log("Autoplay prevented:", e));
      }
    } else {
      // Play next platform video
      setActiveVideoIndex(nextIndex);
      const nextVideo = platformVideoRefs.current[nextIndex];
      if (nextVideo) {
        nextVideo.currentTime = 0;
        nextVideo.play().catch(e => console.log("Autoplay prevented:", e));
      }
    }
  };

  const handleSourceVideoEnded = () => {
    // Start playing first platform video
    setActiveVideoIndex(0);
    const firstVideo = platformVideoRefs.current[0];
    if (firstVideo) {
      firstVideo.currentTime = 0;
      firstVideo.play().catch(e => console.log("Autoplay prevented:", e));
    }
  };

  return (
    <div className="py-16 lg:py-24 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
            One Video, All Platforms
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-gray-300">
            Transform your content into perfectly formatted clips for every social media platform
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 lg:gap-8 flex-wrap lg:flex-nowrap">
          {/* Source Video */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-[#764ba2]/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all" />
            <div className="relative bg-card/80 backdrop-blur border-2 border-primary/20 rounded-3xl p-6 hover-elevate transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-[#764ba2] flex items-center justify-center">
                  <ArrowRight className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">Source Video</p>
                  <p className="text-xs text-gray-400">Any format</p>
                </div>
              </div>
              <div className="w-40 sm:w-48 aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg overflow-hidden border border-primary/20">
                <video 
                  ref={sourceVideoRef}
                  src="/vids/source_clip.mp4" 
                  muted 
                  playsInline
                  onEnded={handleSourceVideoEnded}
                  className="w-full h-full object-cover"
                >
                  <source src="/vids/source_clip.mp4" type="video/mp4" />
                </video>
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-xs text-white/80 text-center">16:9 Video</p>
                </div>
              </div>
            </div>
          </div>

          {/* Animated Arrows */}
          <div className="hidden lg:flex items-center gap-2 animate-pulse">
            <ArrowRight className="h-6 w-6 text-primary" />
            <ArrowRight className="h-6 w-6 text-primary -ml-4" />
            <ArrowRight className="h-6 w-6 text-primary -ml-4" />
          </div>

          {/* Platform Cards */}
          <div className="w-full lg:w-auto">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {platforms.map((platform, index) => {
                const Icon = platform.icon;
                const isActive = index === activeVideoIndex;
                
                return (
                  <div
                    key={platform.name}
                    className={`
                      relative transition-all duration-500 cursor-pointer
                      ${isActive ? "scale-105 z-10" : "scale-100 opacity-70 hover:opacity-100"}
                    `}
                    onClick={() => {
                      setActiveVideoIndex(index);
                      const video = platformVideoRefs.current[index];
                      if (video) {
                        video.currentTime = 0;
                        video.play().catch(e => console.log("Play prevented:", e));
                      }
                    }}
                    data-testid={`platform-${platform.name.toLowerCase().replace(' ', '-')}`}
                  >
                    <div className={`
                      absolute inset-0 bg-gradient-to-br ${platform.color} rounded-2xl blur-md
                      ${isActive ? "opacity-40" : "opacity-0"}
                      transition-opacity duration-500
                    `} />
                    
                    <div className="relative bg-card/80 backdrop-blur border-2 border-primary/20 rounded-2xl p-3 hover-elevate">
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`h-6 w-6 rounded-full bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <p className="text-xs font-semibold text-white">{platform.name}</p>
                      </div>
                      
                      <div 
                        className={`
                          w-full bg-gradient-to-br ${platform.bgGradient} rounded-lg overflow-hidden
                          border border-primary/20 relative
                        `}
                        style={{ aspectRatio: platform.aspectRatio }}
                      >
                        <video
                          ref={el => platformVideoRefs.current[index] = el}
                          src={platform.videoSrc}
                          muted
                          playsInline
                          onEnded={() => handleVideoEnded(index)}
                          className="absolute inset-0 w-full h-full object-cover"
                        >
                          <source src={platform.videoSrc} type="video/mp4" />
                        </video>
                        
                        {!isActive && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                              <div className="h-0 w-0 border-l-[10px] border-l-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-1" />
                            </div>
                          </div>
                        )}
                        
                        {isActive && (
                          <div className="absolute inset-0">
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                            <div className="absolute bottom-2 left-2 right-2">
                              <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                                <div className="h-full bg-white rounded-full animate-[progress_3s_ease-in-out_infinite]" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Indicator Dots - including source video */}
        <div className="mt-8 flex justify-center gap-2">
          <button
            key="source"
            onClick={() => {
              setActiveVideoIndex(-1);
              if (sourceVideoRef.current) {
                sourceVideoRef.current.currentTime = 0;
                sourceVideoRef.current.play().catch(e => console.log("Play prevented:", e));
              }
            }}
            className={`
              h-2 rounded-full transition-all duration-300
              ${activeVideoIndex === -1 ? "w-8 bg-primary" : "w-2 bg-gray-500"}
            `}
            data-testid="indicator-source"
          />
          {platforms.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setActiveVideoIndex(index);
                const video = platformVideoRefs.current[index];
                if (video) {
                  video.currentTime = 0;
                  video.play().catch(e => console.log("Play prevented:", e));
                }
              }}
              className={`
                h-2 rounded-full transition-all duration-300
                ${index === activeVideoIndex ? "w-8 bg-primary" : "w-2 bg-gray-500"}
              `}
              data-testid={`indicator-${index}`}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .hover-elevate:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
