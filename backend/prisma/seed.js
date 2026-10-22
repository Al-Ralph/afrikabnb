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
];

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
  for (const { host, ...l } of listings) {
    const data = { ...l, pricePerNight: new Prisma.Decimal(l.pricePerNight), currency: "XOF" };
    delete data.id;
    await prisma.listing.upsert({
      where: { id: l.id },
      update: { ...data, hostId: userIds[host] },
      create: { id: l.id, ...data, hostId: userIds[host] },
    });
    listingById[l.id] = { ...l, host };
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
        o.status !== "CANCELLED" &&
        b.status !== "CANCELLED" &&
        rangesOverlap(checkIn, checkOut, addDays(today, o.start), addDays(today, o.start + o.nights))
    );
    if (clash) throw new Error(`${b.id} chevauche ${clash.id}`);

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
      `${listings.length} annonces, ${bookings.length} réservations.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
