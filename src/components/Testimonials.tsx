
import { Card, CardContent } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";

const Testimonials = () => {
  const testimonials = [
    {
      name: "Ricardo Mendes",
      company: "E-commerce Tech",
      role: "CEO",
      content: "A PONTO B transformou completamente nossos resultados. Em 6 meses, aumentamos o ROI em 400% e triplicamos as vendas online. A equipe é excepcional!",
      rating: 5,
      result: "+400% ROI"
    },
    {
      name: "Fernanda Costa",
      company: "Clínica Bem-Estar",
      role: "Diretora de Marketing",
      content: "Impressionante como conseguiram gerar mais de 200 leads qualificados por mês. O atendimento é personalizado e os resultados são mensuráveis.",
      rating: 5,
      result: "+200 leads/mês"
    },
    {
      name: "João Santos",
      company: "SaaS Inovador",
      role: "Founder",
      content: "Reduziram nosso CAC em 50% e aumentaram a taxa de conversão significativamente. A estratégia de funil otimizado foi fundamental para nosso crescimento.",
      rating: 5,
      result: "-50% CAC"
    },
    {
      name: "Mariana Silva",
      company: "Loja Virtual Moda",
      role: "Proprietária",
      content: "As landing pages criadas pela PONTO B convertem 40% dos visitantes. Nunca imaginei que pudesse ter resultados tão expressivos online.",
      rating: 5,
      result: "40% conversão"
    },
    {
      name: "Carlos Eduardo",
      company: "Consultoria Empresarial",
      role: "Sócio-Diretor",
      content: "O suporte via WhatsApp e o chatbot com IA revolucionaram nosso atendimento. Aumentamos em 60% a conversão de visitantes em clientes.",
      rating: 5,
      result: "+60% conversão"
    },
    {
      name: "Ana Beatriz",
      company: "Academia Fitness",
      role: "Gerente de Marketing",
      content: "Os dashboards personalizados nos dão visibilidade total dos resultados. Conseguimos otimizar campanhas em tempo real e maximizar o investimento.",
      rating: 5,
      result: "ROI 300%+"
    }
  ];

  return (
    <section className="py-20 bg-brand-navy text-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-4 py-2 bg-brand-gradient rounded-full text-sm font-medium mb-4">
            Depoimentos
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            O Que Nossos Clientes
            <span className="block text-yellow-300">Dizem</span>
          </h2>
          <p className="text-xl text-white/90 max-w-3xl mx-auto">
            Histórias reais de transformação e crescimento. Veja como nossos clientes 
            alcançaram resultados extraordinários com nossas estratégias.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="bg-white/10 backdrop-blur-sm border-white/20 text-white group hover:bg-white/20 transition-all duration-300 hover:-translate-y-2">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Quote Icon */}
                  <Quote className="h-8 w-8 text-yellow-300" />
                  
                  {/* Rating */}
                  <div className="flex space-x-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-300 text-yellow-300" />
                    ))}
                  </div>
                  
                  {/* Content */}
                  <p className="text-white/90 italic leading-relaxed">
                    "{testimonial.content}"
                  </p>
                  
                  {/* Result Badge */}
                  <div className="inline-block px-3 py-1 bg-brand-gradient rounded-full text-sm font-bold">
                    {testimonial.result}
                  </div>
                  
                  {/* Author Info */}
                  <div className="border-t border-white/20 pt-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-brand-gradient rounded-full flex items-center justify-center text-white font-bold">
                        {testimonial.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <div className="font-semibold text-yellow-300">{testimonial.name}</div>
                        <div className="text-sm text-white/80">{testimonial.role}</div>
                        <div className="text-sm text-white/60">{testimonial.company}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats Section */}
        <div className="grid md:grid-cols-4 gap-8 text-center">
          <div className="space-y-2">
            <div className="text-4xl font-bold text-yellow-300">98%</div>
            <div className="text-white/80">Satisfação dos Clientes</div>
          </div>
          <div className="space-y-2">
            <div className="text-4xl font-bold text-yellow-300">500+</div>
            <div className="text-white/80">Projetos Entregues</div>
          </div>
          <div className="space-y-2">
            <div className="text-4xl font-bold text-yellow-300">300%</div>
            <div className="text-white/80">ROI Médio</div>
          </div>
          <div className="space-y-2">
            <div className="text-4xl font-bold text-yellow-300">24/7</div>
            <div className="text-white/80">Suporte Disponível</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
