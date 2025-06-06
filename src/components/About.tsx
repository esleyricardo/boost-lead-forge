
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Award, Users, TrendingUp } from "lucide-react";

const About = () => {
  return (
    <section id="about" className="py-20 bg-brand-navy text-white">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8 animate-fade-in-up">
            <div>
              <span className="inline-block px-4 py-2 bg-brand-gradient rounded-full text-sm font-medium mb-4">
                Sobre Nós
              </span>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Por Que Escolher a
                <span className="block text-yellow-300">PONTO B?</span>
              </h2>
              <p className="text-xl text-white/90 leading-relaxed">
                Não tratamos apenas de anunciar, mas de pensar o seu negócio de forma integral. 
                Realizamos análise completa do funil de vendas, definição estratégica de público-alvo 
                e otimização contínua para resultados extraordinários.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-brand-gradient rounded-lg">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Estratégia Baseada em Dados</h3>
                  <p className="text-white/80">
                    Uma boa escolha de palavras-chave impacta diretamente nos resultados, 
                    tornando os anúncios mais relevantes e aumentando a taxa de conversão.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-3 bg-brand-gradient rounded-lg">
                  <Award className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Equipe Certificada</h3>
                  <p className="text-white/80">
                    Especialistas certificados Google e Meta, com anos de experiência 
                    e resultados comprovados no mercado brasileiro.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-3 bg-brand-gradient rounded-lg">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Garantia Total</h3>
                  <p className="text-white/80">
                    Garantia vitalícia e dinheiro de volta: confiança total no seu investimento. 
                    Transparência e resultados mensuráveis.
                  </p>
                </div>
              </div>
            </div>

            <Button 
              size="lg" 
              className="bg-white text-brand-navy hover:bg-white/90 font-bold px-8 py-4"
            >
              Conheça Nossa História
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          <div className="relative">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl text-center">
                  <Users className="h-8 w-8 mx-auto mb-3 text-yellow-300" />
                  <div className="text-3xl font-bold">500+</div>
                  <div className="text-white/80 text-sm">Clientes Atendidos</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl text-center mt-8">
                  <div className="text-3xl font-bold">5</div>
                  <div className="text-white/80 text-sm">Anos de Experiência</div>
                </div>
              </div>
              <div className="space-y-6 mt-8">
                <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl text-center">
                  <div className="text-3xl font-bold">R$ 50M+</div>
                  <div className="text-white/80 text-sm">Investimento Gerenciado</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl text-center">
                  <div className="text-3xl font-bold">98%</div>
                  <div className="text-white/80 text-sm">Satisfação do Cliente</div>
                </div>
              </div>
            </div>

            {/* Floating elements */}
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-brand-gradient rounded-full opacity-20 animate-float"></div>
            <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-yellow-400 rounded-full opacity-20 animate-float" style={{animationDelay: '1s'}}></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
