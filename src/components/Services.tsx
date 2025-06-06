
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Target, 
  Globe, 
  Bot, 
  BarChart3, 
  MessageCircle,
  ArrowRight,
  CheckCircle 
} from "lucide-react";

const Services = () => {
  const services = [
    {
      icon: <TrendingUp className="h-12 w-12 text-brand-orange" />,
      title: "Gestão de Tráfego Pago",
      subtitle: "Google Ads & Meta Ads",
      description: "Campanhas focadas em resultados: mais visitas qualificadas e vendas. Segmentação avançada por interesses, localização e idade para maximizar ROI.",
      features: [
        "Google Ads Brasil certificado",
        "Campanhas de alta conversão",
        "Segmentação inteligente",
        "Otimização contínua de ROI"
      ]
    },
    {
      icon: <Globe className="h-12 w-12 text-brand-orange" />,
      title: "Landing Pages Otimizadas",
      subtitle: "Sites que Convertem",
      description: "Landing pages que convertem até 40% dos visitantes em leads. Design responsivo e otimização SEO para máxima performance.",
      features: [
        "Design responsivo",
        "Otimização SEO integrada",
        "Experiência do usuário focada",
        "Testes A/B contínuos"
      ]
    },
    {
      icon: <Bot className="h-12 w-12 text-brand-orange" />,
      title: "Atendimento com IA",
      subtitle: "Suporte 24/7",
      description: "Chatbot inteligente que soluciona dúvidas e guia o cliente até a compra, aumentando em até 60% a conversão.",
      features: [
        "Assistente virtual 24 horas",
        "Atendimento ágil e humanizado",
        "Respostas imediatas",
        "Integração WhatsApp"
      ]
    },
    {
      icon: <BarChart3 className="h-12 w-12 text-brand-orange" />,
      title: "Dashboards Personalizados",
      subtitle: "Dados Unificados",
      description: "Painéis de controle com dados de Google Ads, Meta Ads e redes sociais em tempo real. Insights acionáveis com IA.",
      features: [
        "Monitoramento em tempo real",
        "Mais de 20 canais integrados",
        "Insights com inteligência artificial",
        "Relatórios automatizados"
      ]
    },
    {
      icon: <MessageCircle className="h-12 w-12 text-brand-orange" />,
      title: "Suporte WhatsApp",
      subtitle: "Comunidade Exclusiva",
      description: "Acompanhamento direto em grupo de WhatsApp com atendimento rápido e exclusivo. Ajustes em tempo real nas campanhas.",
      features: [
        "Atendimento personalizado",
        "Suporte em grupo exclusivo",
        "Ajustes em tempo real",
        "Proximidade com a equipe"
      ]
    },
    {
      icon: <Target className="h-12 w-12 text-brand-orange" />,
      title: "Consultoria Estratégica",
      subtitle: "Visão 360º",
      description: "Análise completa do funil de vendas, definição de público-alvo e estratégia de crescimento. Cultura de dados e foco em resultados.",
      features: [
        "Análise de funil completa",
        "Estratégia de crescimento",
        "Consultoria especializada",
        "Otimização contínua"
      ]
    }
  ];

  return (
    <section id="services" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-4 py-2 bg-brand-gradient text-white rounded-full text-sm font-medium mb-4">
            Nossos Serviços
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-brand-navy mb-6">
            Marketing Digital
            <span className="block text-brand-orange">Integrado</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Soluções completas para impulsionar seu negócio: desde a criação de campanhas até a análise de resultados, 
            tudo integrado para maximizar suas conversões.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <Card key={index} className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-l-4 border-l-brand-orange">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 p-4 bg-brand-orange/10 rounded-full w-fit group-hover:bg-brand-gradient group-hover:text-white transition-all duration-300">
                  {service.icon}
                </div>
                <CardTitle className="text-xl font-bold text-brand-navy group-hover:text-brand-orange transition-colors">
                  {service.title}
                </CardTitle>
                <CardDescription className="text-brand-orange font-semibold">
                  {service.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground text-center">
                  {service.description}
                </p>
                <ul className="space-y-2">
                  {service.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-sm">
                      <CheckCircle className="h-4 w-4 text-brand-orange mr-2 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full group-hover:bg-brand-gradient group-hover:text-white group-hover:border-transparent transition-all duration-300"
                >
                  Saiba Mais
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-16">
          <Button size="lg" className="bg-brand-gradient hover:bg-brand-gradient-reverse text-white font-bold px-8 py-4">
            Solicite uma Proposta Personalizada
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Services;
