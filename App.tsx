import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, Message } from './types';
import { createPcmBlob, base64ToBytes, decodeAudioData } from './utils/audioUtils';
import { Visualizer } from './components/Visualizer';
import { TranscriptMessage } from './components/TranscriptMessage';

// Icons
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
);
const MicOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
);
const PhoneIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
);
const HangupIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"/></svg>
);

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);

  // Refs for audio handling
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null); // To hold the live session
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of transcript
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
        // Stop session if method available
    }
    
    // Stop microphone
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close Audio Contexts
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    // Stop all playing audio
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();

    setConnectionState(ConnectionState.DISCONNECTED);
    setIsMuted(false);
    nextStartTimeRef.current = 0;
  }, []);

  const connectToGemini = async () => {
    setConnectionState(ConnectionState.CONNECTING);
    setMessages([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Initialize Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const inputCtx = inputAudioContextRef.current;
      const outputCtx = outputAudioContextRef.current;

      // Resume output context to prevent autoplay blocks
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }

      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }, // Friendly voice
          },
          systemInstruction: `You are Alex, a professional and energetic English language teacher. 
Your goal is to conduct an interactive speaking lesson with the user.

CRITICAL INSTRUCTION:
You must ALWAYS SPEAK FIRST immediately after the connection is established. 
Do not wait for the user to say something. 
Start by introducing yourself enthusiastically and asking the user a simple question (e.g., "Hi! I'm Alex. What is your name?").

Rules for interaction:
1. Always ask a follow-up question after the user answers.
2. If the user makes a mistake, gently correct them.
3. Keep your responses concise (1-3 sentences).`,
        },
        callbacks: {
          onopen: async () => {
            setConnectionState(ConnectionState.CONNECTED);
            
            // Resume Audio Context again to be safe
            if (outputCtx.state === 'suspended') {
                await outputCtx.resume();
            }

            // Trigger the model to speak first
            setTimeout(() => {
                sessionPromise.then(session => {
                    // 1. Send a text trigger to "wake up" the model.
                    // Using camelCase 'clientContent' and 'turnComplete' which matches JS SDK conventions.
                    const triggerMsg = {
                        clientContent: {
                            turns: [{
                                role: 'user',
                                parts: [{ text: "Hello teacher, please introduce yourself and start the lesson." }]
                            }],
                            turnComplete: true
                        }
                    };
                    
                    const s = session as any;
                    // Check if send exists (it usually handles raw websocket messages)
                    if (typeof s.send === 'function') {
                         s.send(triggerMsg);
                    }

                    // 2. Fallback: Send 1 second of silence to simulate a completed user turn
                    // This helps if the text trigger is ignored or not supported in this version
                    const silence = new Float32Array(16000); 
                    const pcmBlob = createPcmBlob(silence);
                    // Send a few buffers to ensure connection liveliness
                    s.sendRealtimeInput({ media: pcmBlob });
                });
            }, 100);

            // Process Input Audio
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMuted) return; // Don't send data if muted

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Simple volume meter logic
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setCurrentVolume(Math.sqrt(sum / inputData.length));

              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                 session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle Audio Output
             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio) {
               // Ensure context is running when we receive audio
               if (outputCtx.state === 'suspended') {
                   await outputCtx.resume();
               }

               nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
               
               const audioBytes = base64ToBytes(base64Audio);
               const audioBuffer = await decodeAudioData(audioBytes, outputCtx, 24000, 1);
               
               const source = outputCtx.createBufferSource();
               source.buffer = audioBuffer;
               source.connect(outputNode);
               
               source.addEventListener('ended', () => {
                 sourcesRef.current.delete(source);
               });
               
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += audioBuffer.duration;
               sourcesRef.current.add(source);
             }

             // Handle Interruption
             if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(src => src.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
             }
          },
          onclose: () => {
             disconnect();
          },
          onerror: (err) => {
             console.error(err);
             disconnect();
             setConnectionState(ConnectionState.ERROR);
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (error) {
      console.error("Connection failed", error);
      setConnectionState(ConnectionState.ERROR);
    }
  };

  const toggleMute = () => {
      setIsMuted(!isMuted);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans overflow-hidden relative">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                AI
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">English<span className="text-indigo-400">Tutor</span></h1>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 border ${
            connectionState === ConnectionState.CONNECTED ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
            connectionState === ConnectionState.CONNECTING ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 
            'bg-slate-800 text-slate-400 border-slate-700'
        }`}>
            <span className={`w-2 h-2 rounded-full ${
                 connectionState === ConnectionState.CONNECTED ? 'bg-green-400 animate-pulse' : 
                 connectionState === ConnectionState.CONNECTING ? 'bg-indigo-400 animate-pulse' : 
                 'bg-slate-500'
            }`}></span>
            {connectionState === ConnectionState.CONNECTED ? 'Live Session' : 
             connectionState === ConnectionState.CONNECTING ? 'Connecting...' : 'Ready'}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col max-w-4xl mx-auto w-full p-4">
          
        {/* Intro Screen */}
        {connectionState === ConnectionState.DISCONNECTED && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-0 p-6 animate-fade-in">
                <div className="w-32 h-32 rounded-full bg-slate-800/50 flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/10 ring-1 ring-white/5 relative overflow-hidden group">
                   <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                   <svg className="w-12 h-12 text-indigo-400 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                   </svg>
                </div>
                <h2 className="text-4xl font-bold mb-4 text-white tracking-tight">AI English Teacher</h2>
                <p className="text-slate-400 max-w-md mb-10 leading-relaxed text-lg">
                    Have a natural conversation with Alex. He will ask you questions, listen to your answers, and help you improve your English.
                </p>
                <button 
                    onClick={connectToGemini}
                    className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold text-lg transition-all active:scale-95 shadow-lg shadow-indigo-500/30 flex items-center gap-3 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    <PhoneIcon />
                    <span className="relative z-10">Start Lesson</span>
                </button>
                <p className="mt-6 text-sm text-slate-500">
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    Ready to connect
                </p>
             </div>
        )}

        {/* Transcript Area - SIMPLIFIED: Only showing Voice Visuals mostly as text is disabled to fix error */}
        {connectionState !== ConnectionState.DISCONNECTED && (
            <div 
                ref={transcriptContainerRef}
                className="flex-1 flex flex-col items-center justify-center mb-36 px-4"
            >
                <div className="text-center space-y-6">
                    <div className="inline-block p-4 rounded-full bg-indigo-500/10 text-indigo-400 mb-4 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                    </div>
                    <h3 className="text-2xl font-bold text-white">Conversation Active</h3>
                    <p className="text-slate-400 max-w-sm mx-auto">
                        Speak clearly. Alex is listening and will respond to your answers.
                    </p>
                </div>
            </div>
        )}

      </main>

      {/* Bottom Control Panel */}
      {connectionState !== ConnectionState.DISCONNECTED && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 via-slate-900/95 to-transparent z-20">
            <div className="max-w-2xl mx-auto">
                {/* Visualizer Area */}
                <div className="h-20 mb-4 flex items-center justify-center">
                    <div className="w-full max-w-sm h-full relative">
                        <Visualizer isActive={connectionState === ConnectionState.CONNECTED && !isMuted && currentVolume > 0.01} color="#818cf8" />
                        <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-slate-500 font-medium uppercase tracking-widest mt-2">
                             Listening...
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-6">
                    <button 
                        onClick={toggleMute}
                        className={`p-5 rounded-full transition-all border shadow-lg ${
                            isMuted 
                            ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30' 
                            : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-600 shadow-slate-900/50'
                        }`}
                        title={isMuted ? "Unmute" : "Mute"}
                    >
                        {isMuted ? <MicOffIcon /> : <MicIcon />}
                    </button>

                    <button 
                        onClick={disconnect}
                        className="px-10 py-5 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold flex items-center gap-3 shadow-xl shadow-red-900/40 transition-all active:scale-95 group"
                    >
                        <HangupIcon />
                        <span className="group-hover:translate-x-1 transition-transform">End Lesson</span>
                    </button>
                </div>
            </div>
          </div>
      )}
      
      {/* Error Overlay */}
      {connectionState === ConnectionState.ERROR && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-md text-center shadow-2xl animate-scale-in">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Connection Issue</h3>
                  <p className="text-slate-400 mb-6">
                      Unable to connect to the teacher. Please check your internet connection and try again.
                  </p>
                  <button 
                    onClick={() => setConnectionState(ConnectionState.DISCONNECTED)}
                    className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors"
                  >
                      Return to Menu
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;