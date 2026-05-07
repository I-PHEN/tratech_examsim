import React from 'react';
import { ChevronLeft, MessageSquare, Book, Keyboard, Mail, ExternalLink } from 'lucide-react';

export function HelpScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex-1 w-full flex justify-center py-6 md:py-12 px-4 h-full overflow-y-auto">
      <div className="w-full max-w-3xl space-y-8 animate-fade-in pb-12">
        <div className="flex items-center gap-4 border-b border-border-subtle pb-6">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-container-highest transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
             <h1 className="text-3xl font-bold text-text-primary italic font-['Times_New_Roman']">Help & Support</h1>
             <p className="text-sm text-text-secondary">Find answers or reach out to us</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* FAQ Card */}
           <div className="p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 hover:border-outline-variant/40 transition-colors group cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                 <Book className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Knowledge Base</h3>
              <p className="text-sm text-text-secondary leading-relaxed">Browse articles, tutorials, and frequently asked questions.</p>
           </div>
           
           {/* Contact Card */}
           <div className="p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 hover:border-outline-variant/40 transition-colors group cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary mb-4 group-hover:scale-110 transition-transform">
                 <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Community Discord</h3>
              <p className="text-sm text-text-secondary leading-relaxed">Join our community to ask questions and share feedback.</p>
           </div>
        </div>

        <div className="space-y-6 pt-6">
           <h2 className="text-xl font-bold text-text-primary">Quick Answers</h2>
           
           <div className="space-y-3">
              {[
                 { q: "How do I reset my progress?", a: "Currently, progress cannot be fully reset. You can review past sessions in the 'My Sessions' tab to override recent performance metrics." },
                 { q: "Are the questions based on real past exams?", a: "Yes, our database is curated from past exams and standard curriculum materials updated recently." },
                 { q: "How is 'Yield' calculated?", a: "Yield represents your accuracy on a specific topic or course based on your recent attempt." }
              ].map((faq, i) => (
                 <details key={i} className="group bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
                    <summary className="p-4 font-semibold text-text-primary cursor-pointer hover:bg-surface-container-highest transition-colors flex items-center justify-between outline-none">
                       {faq.q}
                       <span className="text-primary group-open:rotate-45 transition-transform text-2xl leading-none">+</span>
                    </summary>
                    <div className="p-4 pt-0 text-sm text-text-secondary leading-relaxed">
                       {faq.a}
                    </div>
                 </details>
              ))}
           </div>
        </div>
        
        <div className="flex items-center gap-4 justify-center pt-8 text-sm text-text-tertiary">
           <span className="flex items-center gap-2 hover:text-text-primary cursor-pointer transition-colors"><Mail className="w-4 h-4" /> support@engine.stoic</span>
           <span>&bull;</span>
           <span className="flex items-center gap-2 hover:text-text-primary cursor-pointer transition-colors"><ExternalLink className="w-4 h-4" /> v1.0.4-beta</span>
        </div>

      </div>
    </div>
  );
}
