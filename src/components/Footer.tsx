
import { MessageCircle, Mail, Phone, MapPin, Instagram, Linkedin, Facebook } from "lucide-react";

const Footer = () => {
  const services = [
    "Google Ads",
    "Meta Ads (Facebook/Instagram)",
    "Landing Pages Otimizadas",
    "Chatbot com IA",
    "Dashboards Personalizados",
    "Suporte WhatsApp",
    "Consultoria Estratégica",
    "Análise de Performance"
  ];

  const quickLinks = [
    { name: "Início", href: "#home" },
    { name: "Serviços", href: "#services" },
    { name: "Sobre Nós", href: "#about" },
    { name: "Resultados", href: "#results" },
    { name: "Equipe", href: "#team" },
    { name: "Contato", href: "#contact" }
  ];

  const socialLinks = [
    { icon: <Instagram className="h-5 w-5" />, href: "#", name: "Instagram" },
    { icon: <Linkedin className="h-5 w-5" />, href: "#", name: "LinkedIn" },
    { icon: <Facebook className="h-5 w-5" />, href: "#", name: "Facebook" }
  ];

  return (
    <footer className="bg-brand-navy text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-6">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-brand-gradient rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">PB</span>
              </div>
              <span className="text-xl font-bold text-white">PONTO B</span>
            </div>
            <p className="text-white/80 leading-relaxed">
              Agência especializada em marketing digital estratégico. 
              Transformamos visitantes em clientes através de campanhas inteligentes e resultados mensuráveis.
            </p>
            <div className="space-y-3 text-sm">
              <div className="flex items-center space-x-3">
                <MapPin className="h-4 w-4 text-brand-orange" />
                <span className="text-white/80">São Paulo, SP - Brasil</span>
              </div>
              <div className="flex items-center space-x-3">
                <Phone className="h-4 w-4 text-brand-orange" />
                <span className="text-white/80">+55 (11) 99999-9999</span>
              </div>
              <div className="flex items-center space-x-3">
                <Mail className="h-4 w-4 text-brand-orange" />
                <span className="text-white/80">contato@pontob.com.br</span>
              </div>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-lg font-bold text-yellow-300 mb-6">Nossos Serviços</h3>
            <ul className="space-y-3 text-sm">
              {services.map((service, index) => (
                <li key={index}>
                  <a 
                    href="#services" 
                    className="text-white/80 hover:text-brand-orange transition-colors duration-200 flex items-center"
                  >
                    <span className="w-2 h-2 bg-brand-orange rounded-full mr-3"></span>
                    {service}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold text-yellow-300 mb-6">Links Rápidos</h3>
            <ul className="space-y-3 text-sm">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <a 
                    href={link.href} 
                    className="text-white/80 hover:text-brand-orange transition-colors duration-200 flex items-center"
                  >
                    <span className="w-2 h-2 bg-brand-orange rounded-full mr-3"></span>
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h3 className="text-lg font-bold text-yellow-300 mb-6">Fale Conosco</h3>
            <div className="space-y-4">
              <button className="w-full bg-brand-gradient hover:bg-brand-gradient-reverse text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp Direto
              </button>
              
              <button className="w-full border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300">
                Avaliação Grátis
              </button>
            </div>

            <div className="mt-6">
              <h4 className="text-white font-semibold mb-3">Siga-nos:</h4>
              <div className="flex space-x-3">
                {socialLinks.map((social, index) => (
                  <a
                    key={index}
                    href={social.href}
                    className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-brand-gradient transition-all duration-300 group"
                    title={social.name}
                  >
                    <span className="text-white/80 group-hover:text-white">
                      {social.icon}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/20 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-center md:text-left">
              <p className="text-white/80 text-sm">
                © 2024 PONTO B - Marketing Digital Estratégico. Todos os direitos reservados.
              </p>
              <p className="text-white/60 text-xs mt-1">
                Desenvolvido com foco em resultados e crescimento sustentável.
              </p>
            </div>
            
            <div className="flex space-x-6 text-xs">
              <a href="#" className="text-white/80 hover:text-brand-orange transition-colors">
                Política de Privacidade
              </a>
              <a href="#" className="text-white/80 hover:text-brand-orange transition-colors">
                Termos de Uso
              </a>
              <a href="#" className="text-white/80 hover:text-brand-orange transition-colors">
                Cookie Policy
              </a>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center space-x-6 text-xs text-white/60">
              <span className="flex items-center">
                🏆 Google Partner Certificado
              </span>
              <span className="flex items-center">
                🥇 Meta Business Partner
              </span>
              <span className="flex items-center">
                ⭐ 98% Satisfação Cliente
              </span>
              <span className="flex items-center">
                🔒 Dados 100% Seguros
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
