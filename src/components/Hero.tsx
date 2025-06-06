
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Target, Zap } from "lucide-react";

const Hero = () => {
  return (
    <section id="home" className="pt-20 min-h-screen bg-brand-gradient relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent"></div>
      
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
          <div className="text-white space-y-8 animate-fade-in-up">
            <div className="space-y-4">
              <span className="inline-block px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm font-medium">
                🚀 Marketing Digital Estratégico
              </span>
              
              <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                Impulsione Vendas 
                <span className="block text-yellow-300">Agora</span>
                com Campanhas de Tráfego Pago
                <span className="block text-yellow-300">Inteligentes</span>
              </h1>
              
              <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
                Gestão 360º de marketing: anúncios, landing pages e análises de resultados. 
                Transforme visitantes em clientes com estratégias comprovadas.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg" 
                className="bg-white text-brand-navy hover:bg-white/90 font-bold px-8 py-4 text-lg group"
              >
                Solicite uma Avaliação Grátis
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-brand-navy font-bold px-8 py-4 text-lg"
              >
                Ver Nossos Resultados
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">+300%</div>
                <div className="text-white/80 text-sm">ROI Médio</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">40%</div>
                <div className="text-white/80 text-sm">Taxa de Conversão</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">24/7</div>
                <div className="text-white/80 text-sm">Suporte IA</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-3xl animate-float"></div>
            <div className="relative p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/20 backdrop-blur-sm p-6 rounded-2xl text-white text-center">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 text-yellow-300" />
                  <div className="font-bold">Google Ads</div>
                  <div className="text-sm text-white/80">Campanhas de Alta Performance</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm p-6 rounded-2xl text-white text-center">
                  <Target className="h-8 w-8 mx-auto mb-2 text-yellow-300" />
                  <div className="font-bold">Meta Ads</div>
                  <div className="text-sm text-white/80">Facebook & Instagram</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm p-6 rounded-2xl text-white text-center">
                  <Zap className="h-8 w-8 mx-auto mb-2 text-yellow-300" />
                  <div className="font-bold">Landing Pages</div>
                  <div className="text-sm text-white/80">Otimizadas para Conversão</div>
                </div>
                <div className="bg-white/20 backdrop-blur-sm p-6 rounded-2xl text-white text-center">
                  <div className="text-2xl mb-2">🤖</div>
                  <div className="font-bold">IA Support</div>
                  <div className="text-sm text-white/80">Atendimento Inteligente</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
