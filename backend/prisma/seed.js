import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  addDays,
  averageRating,
  computeTotalPrice,
  nightsBetween,
  parseDay,
  rangesOverlap,
  todayDay,
} from "../src/utils/booking.js";

if (process.env.NODE_ENV === "production") {
  console.error("Seed refusé : NODE_ENV=production (données et mot de passe de démo).");
  process.exit(1);
}

// Seed idempotent : identifiants fixes + upsert. Relancer le seed ne crée pas de doublons
// et ne modifie ni les mots de passe ni les réservations/avis déjà présents.

const prisma = new PrismaClient();
const DEMO_PASSWORD = "demo1234";

const users = [
  { key: "demo", email: "host@afrikabnb.com", name: "AfrikaBnB Demo", role: "HOST" },
  { key: "awa", email: "awa@afrikabnb.com", name: "Awa Diop", role: "HOST" },
  { key: "kofi", email: "kofi@afrikabnb.com", name: "Kofi Mensah", role: "GUEST" },
  { key: "admin", email: "admin@afrikabnb.com", name: "Admin AfrikaBnB", role: "ADMIN" },
];

const img = (id) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;

// Prix en francs CFA (XOF). Au moins 2 annonces par catégorie du front.
const listings = [
  // piscines
  { id: "seed-cape-town-villa", host: "demo", categoryId: "piscines", title: "Luxurious Villa in Cape Town", location: "Camps Bay, Cape Town, South Africa", latitude: -33.9508, longitude: 18.3776, pricePerNight: 290000, maxGuests: 8, bedrooms: 4, acceptsPets: true, imageUrl: img("1613490493576-7fde63acd811"), description: "Villa avec piscine à débordement face à l'Atlantique, au pied des Douze Apôtres." },
  { id: "seed-abidjan-pool-villa", host: "awa", categoryId: "piscines", title: "Villa avec piscine à Cocody", location: "Cocody, Abidjan, Côte d'Ivoire", latitude: 5.3486, longitude: -3.9867, pricePerNight: 85000, maxGuests: 6, bedrooms: 3, acceptsPets: false, imageUrl: img("1571896349842-33c89424de2d"), description: "Grande villa familiale avec piscine privée et jardin tropical." },
  // bord-mer
  { id: "seed-dakar-seaside-villa", host: "demo", categoryId: "bord-mer", title: "Seaside Villa in Dakar", location: "Les Almadies, Dakar, Senegal", latitude: 14.7453, longitude: -17.5133, pricePerNight: 120000, maxGuests: 6, bedrooms: 3, acceptsPets: true, imageUrl: img("1566073771259-6a8506099945"), description: "Villa les pieds dans l'eau à la pointe ouest de l'Afrique." },
  { id: "seed-lome-beach-house", host: "awa", categoryId: "bord-mer", title: "Maison de plage à Lomé", location: "Lomé, Togo", latitude: 6.1228, longitude: 1.2311, pricePerNight: 45000, maxGuests: 4, bedrooms: 2, acceptsPets: true, imageUrl: img("1507525428034-b723cf961d3e"), description: "Maison lumineuse face au golfe de Guinée, à deux pas du marché." },
  // safari
  { id: "seed-serengeti-eco-lodge", host: "demo", categoryId: "safari", title: "Eco-Lodge in Serengeti", location: "Serengeti, Tanzania", latitude: -2.3333, longitude: 34.8333, pricePerNight: 350000, maxGuests: 4, bedrooms: 2, acceptsPets: false, imageUrl: img("1516426122078-c23e76319801"), description: "Lodge solaire au cœur de la grande migration." },
  { id: "seed-masai-mara-camp", host: "awa", categoryId: "safari", title: "Camp de tentes au Masai Mara", location: "Masai Mara, Kenya", latitude: -1.49, longitude: 35.144, pricePerNight: 260000, maxGuests: 2, bedrooms: 1, acceptsPets: false, imageUrl: img("1516426122078-c23e76319801"), description: "Tente de luxe avec safaris guidés à l'aube." },
  // cabanes
  { id: "seed-kpalime-cabin", host: "demo", categoryId: "cabanes", title: "Cabane dans la forêt de Kpalimé", location: "Kpalimé, Togo", latitude: 6.9, longitude: 0.6333, pricePerNight: 30000, maxGuests: 2, bedrooms: 1, acceptsPets: true, imageUrl: img("1449158743715-0a90ebb6d2d8"), description: "Cabane en bois entre cascades et plantations de café." },
  { id: "seed-drakensberg-chalet", host: "awa", categoryId: "cabanes", title: "Chalet au pied du Drakensberg", location: "Winterton, KwaZulu-Natal, South Africa", latitude: -28.8075, longitude: 29.5328, pricePerNight: 65000, maxGuests: 4, bedrooms: 2, acceptsPets: true, imageUrl: img("1510798831971-661eb04b3739"), description: "Chalet avec cheminée et vue sur l'amphithéâtre du Drakensberg." },
  // tendance
  { id: "seed-marrakech-riad", host: "demo", categoryId: "tendance", title: "Traditional Riad in Marrakech", location: "Médina, Marrakech, Morocco", latitude: 31.6295, longitude: -7.9811, pricePerNight: 70000, maxGuests: 6, bedrooms: 3, acceptsPets: false, imageUrl: img("1540202404-a2f29016b523"), description: "Riad restauré avec patio, fontaine et terrasse sur les toits." },
  { id: "seed-nairobi-apartment", host: "awa", categoryId: "tendance", title: "Modern Apartment in Nairobi", location: "Westlands, Nairobi, Kenya", latitude: -1.2676, longitude: 36.8108, pricePerNight: 50000, maxGuests: 3, bedrooms: 1, acceptsPets: false, imageUrl: img("1502672260266-1c1ef2d93688"), description: "Appartement design proche des restaurants et galeries de Westlands." },
  { id: "seed-accra-loft", host: "demo", categoryId: "tendance", title: "Loft à Osu, Accra", location: "Osu, Accra, Ghana", latitude: 5.556, longitude: -0.182, pricePerNight: 55000, maxGuests: 2, bedrooms: 1, acceptsPets: false, imageUrl: img("1600585154340-be6161a56a0c"), description: "Loft lumineux sur Oxford Street, au cœur de la vie nocturne." },
  // omg
  { id: "seed-matmata-troglodyte", host: "awa", categoryId: "omg", title: "Maison troglodyte à Matmata", location: "Matmata, Tunisia", latitude: 33.5446, longitude: 9.9706, pricePerNight: 40000, maxGuests: 4, bedrooms: 2, acceptsPets: false, imageUrl: img("1518780664697-55e3ad937233"), description: "Dormez dans une habitation berbère creusée dans la roche." },
  { id: "seed-merzouga-bubble", host: "demo", categoryId: "omg", title: "Bulle transparente à Merzouga", location: "Merzouga, Morocco", latitude: 31.0802, longitude: -4.0133, pricePerNight: 95000, maxGuests: 2, bedrooms: 1, acceptsPets: false, imageUrl: img("1600596542815-ffad4c1539a9"), description: "Une nuit sous les étoiles au milieu des dunes de l'Erg Chebbi." },
  // parcs
  { id: "seed-kruger-lodge", host: "awa", categoryId: "parcs", title: "Lodge en bordure du Kruger", location: "Skukuza, Kruger National Park, South Africa", latitude: -24.9948, longitude: 31.5969, pricePerNight: 180000, maxGuests: 4, bedrooms: 2, acceptsPets: false, imageUrl: img("1564013799919-ab600027ffc6"), description: "Lodge avec terrasse surplombant la rivière Sabie." },
  { id: "seed-volcanoes-lodge", host: "demo", categoryId: "parcs", title: "Lodge près du parc des Volcans", location: "Kinigi, Musanze, Rwanda", latitude: -1.43, longitude: 29.588, pricePerNight: 150000, maxGuests: 4, bedrooms: 2, acceptsPets: false, imageUrl: img("1510798831971-661eb04b3739"), description: "Point de départ idéal pour la rencontre des gorilles des montagnes." },
  // iles
  { id: "seed-zanzibar-bungalow", host: "demo", categoryId: "iles", title: "Cozy Beachfront Bungalow in Zanzibar", location: "Nungwi, Zanzibar, Tanzania", latitude: -5.7263, longitude: 39.2981, pricePerNight: 110000, maxGuests: 4, bedrooms: 2, acceptsPets: true, imageUrl: img("1582719508461-905c673771fd"), description: "Bungalow sur le sable blanc, couchers de soleil sur l'océan Indien." },
  { id: "seed-goree-house", host: "awa", categoryId: "iles", title: "Maison coloniale à Gorée", location: "Île de Gorée, Dakar, Senegal", latitude: 14.6672, longitude: -17.3983, pricePerNight: 75000, maxGuests: 4, bedrooms: 2, acceptsPets: false, imageUrl: img("1499793983690-e29da59ef1c2"), description: "Maison aux volets colorés dans les ruelles sans voitures de l'île." },
  { id: "seed-nosy-be-villa", host: "demo", categoryId: "iles", title: "Villa créole à Nosy Be", location: "Nosy Be, Madagascar", latitude: -13.3333, longitude: 48.2667, pricePerNight: 90000, maxGuests: 6, bedrooms: 3, acceptsPets: true, imageUrl: img("1520250497591-112f2f40a3f4"), description: "Villa entourée d'ylang-ylang, plage privée et plongée." },
  // luxe
  { id: "seed-marrakech-palace", host: "awa", categoryId: "luxe", title: "Palais dans la Palmeraie", location: "Palmeraie, Marrakech, Morocco", latitude: 31.67, longitude: -7.97, pricePerNight: 450000, maxGuests: 10, bedrooms: 5, acceptsPets: false, imageUrl: img("1580587771525-78b9dba3b914"), description: "Palais privé avec hammam, piscine chauffée et personnel dédié." },
  { id: "seed-lagos-ikoyi-villa", host: "demo", categoryId: "luxe", title: "Villa de prestige à Ikoyi", location: "Ikoyi, Lagos, Nigeria", latitude: 6.4541, longitude: 3.4347, pricePerNight: 380000, maxGuests: 8, bedrooms: 4, acceptsPets: false, imageUrl: img("1512917774080-9991f1c4c750"), description: "Villa contemporaine sécurisée avec piscine et cinéma privé." },
];

// Équipements par annonce (enum Amenity) ; instantBook: false = réservation sur demande.
const extras = {
  "seed-cape-town-villa": { amenities: ["WIFI", "POOL", "SEA_VIEW", "PARKING", "KITCHEN", "WASHER", "TV", "AIR_CONDITIONING", "TERRACE", "BBQ"] },
  "seed-abidjan-pool-villa": { amenities: ["WIFI", "POOL", "AIR_CONDITIONING", "GENERATOR", "WATER_TANK", "SECURITY", "GARDEN", "PARKING", "KITCHEN"] },
  "seed-dakar-seaside-villa": { amenities: ["WIFI", "SEA_VIEW", "BEACH_ACCESS", "AIR_CONDITIONING", "KITCHEN", "TERRACE", "SECURITY"] },
  "seed-lome-beach-house": { amenities: ["WIFI", "SEA_VIEW", "BEACH_ACCESS", "FAN", "GENERATOR", "WATER_TANK", "KITCHEN", "MOSQUITO_NETS", "SECURITY"] },
  "seed-serengeti-eco-lodge": { amenities: ["SOLAR_POWER", "BREAKFAST", "AIRPORT_SHUTTLE", "MOSQUITO_NETS", "HOUSEKEEPING", "TERRACE"] },
  "seed-masai-mara-camp": { amenities: ["SOLAR_POWER", "BREAKFAST", "MOSQUITO_NETS", "HOUSEKEEPING", "SECURITY"] },
  "seed-kpalime-cabin": { amenities: ["GARDEN", "FAN", "WATER_TANK", "SOLAR_POWER", "BREAKFAST", "MOSQUITO_NETS"] },
  "seed-drakensberg-chalet": { amenities: ["WIFI", "KITCHEN", "PARKING", "GARDEN", "BBQ", "WATER_HEATER"] },
  "seed-marrakech-riad": { amenities: ["WIFI", "AIR_CONDITIONING", "BREAKFAST", "TERRACE", "HOUSEKEEPING", "WATER_HEATER"] },
  "seed-nairobi-apartment": { amenities: ["WIFI", "WORKSPACE", "KITCHEN", "WASHER", "TV", "SECURITY", "CCTV", "GENERATOR"] },
  "seed-accra-loft": { amenities: ["WIFI", "AIR_CONDITIONING", "WORKSPACE", "TV", "GENERATOR", "SECURITY"] },
  "seed-matmata-troglodyte": { amenities: ["BREAKFAST", "PARKING", "HOUSEKEEPING"] },
  "seed-merzouga-bubble": { amenities: ["BREAKFAST", "AIRPORT_SHUTTLE", "SOLAR_POWER"] },
  "seed-kruger-lodge": { amenities: ["WIFI", "POOL", "BREAKFAST", "PARKING", "TERRACE", "AIR_CONDITIONING"] },
  "seed-volcanoes-lodge": { amenities: ["WIFI", "BREAKFAST", "WATER_HEATER", "GARDEN", "AIRPORT_SHUTTLE"] },
  "seed-zanzibar-bungalow": { amenities: ["WIFI", "SEA_VIEW", "BEACH_ACCESS", "FAN", "MOSQUITO_NETS", "BREAKFAST"] },
  "seed-goree-house": { amenities: ["SEA_VIEW", "FAN", "KITCHEN", "TERRACE", "WATER_TANK"], instantBook: false },
  "seed-nosy-be-villa": { amenities: ["WIFI", "POOL", "SEA_VIEW", "BEACH_ACCESS", "GENERATOR", "GARDEN", "KITCHEN"] },
  "seed-marrakech-palace": { amenities: ["WIFI", "POOL", "AIR_CONDITIONING", "BREAKFAST", "HOUSEKEEPING", "PARKING", "GARDEN", "SECURITY", "AIRPORT_SHUTTLE"], instantBook: false },
  "seed-lagos-ikoyi-villa": { amenities: ["WIFI", "POOL", "AIR_CONDITIONING", "GENERATOR", "WATER_TANK", "SECURITY", "CCTV", "TV", "PARKING", "WORKSPACE"], instantBook: false },
};

// Photos supplémentaires (intérieurs) : 1 à 3 par annonce après la couverture (position 0 = imageUrl).
const interiorPhotos = [
  "1505693416388-ac5ce068fe85",
  "1522708323590-d24dbb6b0267",
  "1484154218962-a197022b5858",
  "1560448204-e02f11c3d0e2",
  "1493809842364-78817add7ffb",
  "1586023492125-27b2c045efd7",
  "1600607687939-ce8a6c25118c",
  "1600566753190-17f0baa2a6c3",
  "1631049307264-da0ec9d70304",
  "1540518614846-7eded433c457",
  "1502005229762-cf1b2da7c5d6",
  "1554995207-c18c203602cb",
];

function imagesFor(listing, index) {
  const extraCount = 1 + (index % 3);
  const urls = [listing.imageUrl];
  for (let i = 0; i < extraCount; i++) urls.push(img(interiorPhotos[(index * 3 + i) % interiorPhotos.length]));
  return urls.map((url, position) => ({
    id: `${listing.id}-img-${position}`,
    url,
    position,
    alt: `${listing.title} – photo ${position + 1}`,
  }));
}

// Dates bloquées par l'hôte (start = décalage en jours).
const blockedPeriods = [
  { id: "seed-blocked-01", listing: "seed-lome-beach-house", start: 40, nights: 5, reason: "Travaux de peinture" },
  { id: "seed-blocked-02", listing: "seed-kpalime-cabin", start: 20, nights: 7, reason: "Séjour personnel" },
];

// Titres des annonces créées par l'ancienne version du seed (identifiants aléatoires) :
// supprimées pour éviter les doublons avec les annonces à identifiant fixe ci-dessus.
const legacyTitles = [
  "Luxurious Villa in Cape Town",
  "Traditional Riad in Marrakech",
  "Cozy Beachfront Bungalow in Zanzibar",
  "Modern Apartment in Nairobi",
  "Eco-Lodge in Serengeti",
  "Seaside Villa in Dakar",
];

// Dates relatives à aujourd'hui (start = décalage en jours de l'arrivée).
const bookings = [
  // Séjours passés avec avis
  { id: "seed-booking-01", listing: "seed-cape-town-villa", guest: "kofi", start: -140, nights: 5, guests: 4, review: { rating: 5, comment: "Vue incroyable sur l'océan, la piscine est encore plus belle qu'en photo." } },
  { id: "seed-booking-02", listing: "seed-cape-town-villa", guest: "awa", start: -60, nights: 3, guests: 2, review: { rating: 4, comment: "Superbe villa, un peu de bruit le week-end mais hôte très réactif." } },
  { id: "seed-booking-03", listing: "seed-abidjan-pool-villa", guest: "kofi", start: -90, nights: 4, guests: 5, review: { rating: 5, comment: "Parfait pour une famille, quartier calme et sûr." } },
  { id: "seed-booking-04", listing: "seed-dakar-seaside-villa", guest: "kofi", start: -200, nights: 7, guests: 3, review: { rating: 5, comment: "Les couchers de soleil depuis la terrasse valent le voyage." } },
  { id: "seed-booking-05", listing: "seed-dakar-seaside-villa", guest: "awa", start: -30, nights: 2, guests: 2, review: { rating: 4, comment: "Très bel emplacement, cuisine bien équipée." } },
  { id: "seed-booking-06", listing: "seed-lome-beach-house", guest: "kofi", start: -75, nights: 3, guests: 2, review: { rating: 4, comment: "Maison agréable et bien située, idéale pour découvrir Lomé." } },
  { id: "seed-booking-07", listing: "seed-serengeti-eco-lodge", guest: "awa", start: -110, nights: 3, guests: 2, review: { rating: 5, comment: "Nous avons vu la migration depuis le lodge, inoubliable." } },
  { id: "seed-booking-08", listing: "seed-masai-mara-camp", guest: "kofi", start: -50, nights: 2, guests: 2, review: { rating: 5, comment: "Guides passionnés, tente très confortable." } },
  { id: "seed-booking-09", listing: "seed-kpalime-cabin", guest: "kofi", start: -40, nights: 2, guests: 2, review: { rating: 4, comment: "Calme absolu, belles randonnées vers les cascades." } },
  { id: "seed-booking-10", listing: "seed-kpalime-cabin", guest: "awa", start: -15, nights: 3, guests: 1, review: { rating: 3, comment: "Cadre magnifique mais accès difficile en saison des pluies." } },
  { id: "seed-booking-11", listing: "seed-marrakech-riad", guest: "kofi", start: -180, nights: 4, guests: 4, review: { rating: 5, comment: "Riad splendide, petit-déjeuner sur la terrasse exceptionnel." } },
  { id: "seed-booking-12", listing: "seed-nairobi-apartment", guest: "kofi", start: -25, nights: 5, guests: 1, review: { rating: 4, comment: "Appartement moderne et propre, très pratique." } },
  { id: "seed-booking-13", listing: "seed-matmata-troglodyte", guest: "kofi", start: -95, nights: 1, guests: 2, review: { rating: 5, comment: "Expérience unique, accueil chaleureux." } },
  { id: "seed-booking-14", listing: "seed-kruger-lodge", guest: "kofi", start: -130, nights: 3, guests: 3, review: { rating: 5, comment: "Éléphants au bord de la rivière au petit matin !" } },
  { id: "seed-booking-15", listing: "seed-zanzibar-bungalow", guest: "kofi", start: -70, nights: 6, guests: 2, review: { rating: 5, comment: "Plage de rêve, bungalow charmant." } },
  { id: "seed-booking-16", listing: "seed-zanzibar-bungalow", guest: "awa", start: -20, nights: 4, guests: 3, review: { rating: 4, comment: "Très bon séjour, quelques coupures d'électricité." } },
  { id: "seed-booking-17", listing: "seed-goree-house", guest: "kofi", start: -160, nights: 2, guests: 2, review: { rating: 4, comment: "Île paisible et chargée d'histoire, maison pleine de charme." } },
  { id: "seed-booking-18", listing: "seed-marrakech-palace", guest: "kofi", start: -45, nights: 2, guests: 6, review: { rating: 5, comment: "Service irréprochable, un vrai palais." } },
  { id: "seed-booking-19", listing: "seed-lagos-ikoyi-villa", guest: "awa", start: -35, nights: 3, guests: 4, review: { rating: 4, comment: "Villa luxueuse, circulation de Lagos à anticiper." } },
  // Séjour passé sans avis (le voyageur peut encore en laisser un)
  { id: "seed-booking-20", listing: "seed-merzouga-bubble", guest: "kofi", start: -10, nights: 1, guests: 2 },
  // Réservations à venir
  { id: "seed-booking-21", listing: "seed-lome-beach-house", guest: "kofi", start: 14, nights: 4, guests: 3 },
  { id: "seed-booking-22", listing: "seed-cape-town-villa", guest: "kofi", start: 30, nights: 7, guests: 6 },
  { id: "seed-booking-23", listing: "seed-volcanoes-lodge", guest: "awa", start: 21, nights: 3, guests: 2 },
  { id: "seed-booking-24", listing: "seed-nosy-be-villa", guest: "kofi", start: 45, nights: 5, guests: 4, status: "CANCELLED" },
  // Demande en attente de l'hôte (annonce sans réservation instantanée ; expire 48 h après le seed)
  { id: "seed-booking-25", listing: "seed-goree-house", guest: "kofi", start: 10, nights: 3, guests: 2, status: "PENDING" },
  // Demande refusée par l'hôte
  { id: "seed-booking-26", listing: "seed-marrakech-palace", guest: "kofi", start: 25, nights: 2, guests: 4, status: "DECLINED" },
];

const RELEASED = ["CANCELLED", "DECLINED", "EXPIRED"];

async function main() {
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userIds = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: { email: u.email, password: hashed, name: u.name, role: u.role },
    });
    userIds[u.key] = user.id;
  }

  const seededIds = listings.map((l) => l.id);
  await prisma.listing.deleteMany({
    where: { title: { in: legacyTitles }, id: { notIn: seededIds }, hostId: userIds.demo },
  });

  const listingById = {};
  for (const [index, { host, ...l }] of listings.entries()) {
    const data = {
      ...l,
      pricePerNight: new Prisma.Decimal(l.pricePerNight),
      currency: "XOF",
      amenities: extras[l.id]?.amenities ?? [],
      instantBook: extras[l.id]?.instantBook ?? true,
      status: "ACTIVE",
    };
    delete data.id;
    await prisma.listing.upsert({
      where: { id: l.id },
      update: { ...data, hostId: userIds[host] },
      create: { id: l.id, ...data, hostId: userIds[host] },
    });
    listingById[l.id] = { ...l, host };

    // Photos : identifiants fixes. Les images externes non issues du seed (ex. reprise de
    // imageUrl par la migration 20261022180000_vague3) sont remplacées ; les photos téléversées
    // (path non nul) sont conservées après celles du seed.
    const images = imagesFor(l, index);
    await prisma.listingImage.deleteMany({
      where: { listingId: l.id, path: null, id: { notIn: images.map((i) => i.id) } },
    });
    for (const image of images) {
      await prisma.listingImage.upsert({
        where: { id: image.id },
        update: { url: image.url, position: image.position, alt: image.alt },
        create: { ...image, listingId: l.id, path: null },
      });
    }
    const uploaded = await prisma.listingImage.findMany({
      where: { listingId: l.id, path: { not: null } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    for (const [i, u] of uploaded.entries()) {
      await prisma.listingImage.update({ where: { id: u.id }, data: { position: images.length + i } });
    }
    await prisma.listing.update({ where: { id: l.id }, data: { imageUrl: images[0].url } });
  }

  const today = todayDay();
  for (const b of bookings) {
    const listing = listingById[b.listing];
    const checkIn = addDays(today, b.start);
    const checkOut = addDays(checkIn, b.nights);
    if (listing.host === b.guest) throw new Error(`${b.id} : un hôte ne réserve pas sa propre annonce`);
    if (b.guests > listing.maxGuests) throw new Error(`${b.id} : capacité dépassée`);
    const clash = bookings.find(
      (o) =>
        o !== b &&
        o.listing === b.listing &&
        !RELEASED.includes(o.status) &&
        !RELEASED.includes(b.status) &&
        rangesOverlap(checkIn, checkOut, addDays(today, o.start), addDays(today, o.start + o.nights))
    );
    if (clash) throw new Error(`${b.id} chevauche ${clash.id}`);
    const blockedClash = blockedPeriods.find(
      (p) =>
        p.listing === b.listing &&
        !RELEASED.includes(b.status) &&
        rangesOverlap(checkIn, checkOut, addDays(today, p.start), addDays(today, p.start + p.nights))
    );
    if (blockedClash) throw new Error(`${b.id} chevauche ${blockedClash.id}`);

    const booking = await prisma.booking.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        listingId: b.listing,
        guestId: userIds[b.guest],
        checkIn: parseDay(checkIn),
        checkOut: parseDay(checkOut),
        guests: b.guests,
        totalPrice: new Prisma.Decimal(
          computeTotalPrice(listing.pricePerNight, nightsBetween(checkIn, checkOut)).toFixed(2)
        ),
        status: b.status ?? "CONFIRMED",
      },
    });
    if (b.review) {
      await prisma.review.upsert({
        where: { bookingId: booking.id },
        update: {},
        create: {
          listingId: b.listing,
          authorId: userIds[b.guest],
          bookingId: booking.id,
          rating: b.review.rating,
          comment: b.review.comment,
        },
      });
    }
  }

  for (const p of blockedPeriods) {
    const startDate = addDays(today, p.start);
    await prisma.blockedPeriod.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        listingId: p.listing,
        startDate: parseDay(startDate),
        endDate: parseDay(addDays(startDate, p.nights)),
        reason: p.reason,
      },
    });
  }

  // Note moyenne et nombre d'avis recalculés à partir des avis réellement en base.
  for (const id of seededIds) {
    const agg = await prisma.review.aggregate({
      where: { listingId: id },
      _sum: { rating: true },
      _count: { _all: true },
    });
    await prisma.listing.update({
      where: { id },
      data: {
        rating: averageRating(agg._sum.rating, agg._count._all),
        reviewCount: agg._count._all,
      },
    });
  }

  console.log(
    `Seed OK : ${users.length} utilisateurs (mot de passe : ${DEMO_PASSWORD}), ` +
      `${listings.length} annonces (photos et équipements), ${bookings.length} réservations, ` +
      `${blockedPeriods.length} périodes bloquées. Admin : admin@afrikabnb.com.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
