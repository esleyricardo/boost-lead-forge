
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  MessageCircle, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  ArrowRight,
  CheckCircle,
  Zap
} from "lucide-react";

const Contact = () => {
  const contactMethods = [
    {
      icon: <MessageCircle className="h-8 w-8 text-brand-orange" />,
      title: "WhatsApp Direto",
      description: "Atendimento imediato via WhatsApp",
      action: "Iniciar Conversa",
      highlight: "Resposta em 5 min"
    },
    {
      icon: <Phone className="h-8 w-8 text-brand-orange" />,
      title: "Ligação Estratégica",
      description: "Agende uma conversa com especialista",
      action: "Agendar Ligação",
      highlight: "Consulta gratuita"
    },
    {
      icon: <Mail className="h-8 w-8 text-brand-orange" />,
      title: "Proposta Personalizada",
      description: "Receba proposta detalhada por email",
      action: "Solicitar Proposta",
      highlight: "Sem compromisso"
    }
  ];

  const benefits = [
    "Avaliação gratuita do seu negócio",
    "Proposta personalizada em 24h",
    "Garantia de resultados ou dinheiro de volta",
    "Suporte exclusivo via WhatsApp",
    "Dashboard em tempo real incluído",
    "Primeira consultoria sem custo"
  ];

  return (
    <section id="contact" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-4 py-2 bg-brand-gradient text-white rounded-full text-sm font-medium mb-4">
            Entre em Contato
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-brand-navy mb-6">
            Pronto para
            <span className="block text-brand-orange">Acelerar Vendas?</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Fale conosco agora e descubra como podemos impulsionar seus resultados. 
            Avaliação gratuita e proposta personalizada em 24 horas.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Contact Methods */}
          <div className="space-y-8">
            <div className="space-y-6">
              {contactMethods.map((method, index) => (
                <Card key={index} className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-l-4 border-l-brand-orange">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-brand-orange/10 rounded-lg group-hover:bg-brand-gradient group-hover:text-white transition-all duration-300">
                          {method.icon}
                        </div>
                        <div>
                          <CardTitle className="text-xl text-brand-navy group-hover:text-brand-orange transition-colors">
                            {method.title}
                          </CardTitle>
                          <p className="text-muted-foreground">{method.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-brand-gradient text-white text-xs rounded-full font-semibold">
                          {method.highlight}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full bg-brand-gradient hover:bg-brand-gradient-reverse text-white font-semibold group-hover:shadow-lg transition-all duration-300"
                    >
                      {method.action}
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Contact Info */}
            <Card className="bg-brand-navy text-white">
              <CardContent className="p-6">
                <h3 className="text-xl font-bold mb-4 text-yellow-300">Informações de Contato</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <MapPin className="h-5 w-5 text-brand-orange" />
                    <span>São Paulo, SP - Atendimento Nacional</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Clock className="h-5 w-5 text-brand-orange" />
                    <span>Segunda à Sexta: 8h às 18h</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Zap className="h-5 w-5 text-brand-orange" />
                    <span>Suporte 24/7 para clientes</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Benefits & CTA */}
          <div className="space-y-8">
            <Card className="bg-background">
              <CardHeader>
                <CardTitle className="text-2xl text-brand-navy">
                  O Que Você Ganha Hoje:
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {benefits.map((benefit, index) => (
                    <li key={index} className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-brand-orange flex-shrink-0" />
                      <span className="text-muted-foreground">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Main CTA */}
            <div className="bg-brand-gradient p-8 rounded-3xl text-white text-center">
              <h3 className="text-2xl font-bold mb-4">
                🚀 Oferta Limitada: Avaliação Grátis
              </h3>
              <p className="text-white/90 mb-6">
                Primeiros 50 clientes ganham análise completa gratuita do negócio 
                + estratégia personalizada sem custo.
              </p>
              <div className="space-y-4">
                <Button 
                  size="lg" 
                  className="bg-white text-brand-navy hover:bg-white/90 font-bold px-8 py-4 w-full"
                >
                  Quero Minha Avaliação Grátis Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="text-white/80 text-sm">
                  ⚡ Resposta em até 2 horas | 🎯 100% Focado em Resultados
                </p>
              </div>
            </div>

            {/* Urgency Banner */}
            <div className="bg-brand-navy text-white p-6 rounded-2xl text-center">
              <h4 className="font-bold text-yellow-300 mb-2">⏰ Vagas Limitadas</h4>
              <p className="text-white/90 text-sm">
                Atendemos apenas 10 novos clientes por mês para garantir resultados excepcionais. 
                <span className="block font-semibold text-yellow-300 mt-1">Não perca sua vaga!</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
