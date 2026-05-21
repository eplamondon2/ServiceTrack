import { useState, useEffect } from 'react';
import { api } from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../pages/Dashboard';

const SDS_URL = 'https://luxoto.sdswebapp.com:9746/SDSWeb';

const TYPE_ICONS = { note:'ti-note', appel:'ti-phone', texto:'ti-message', courriel:'ti-mail', livraison:'ti-check', statut:'ti-refresh' };

const STATUT_DETAIL_LABELS = {
  rdv_avenir:        '🗓 Rendez-vous à venir',
  piece_commande:    '📦 Pièce en commande',
  vehicule_sur_place:'🔧 Véhicule sur place',
  hytac:             '🏢 HYTAC',
  livre:             '✅ Livré',
};

export default function WorkOrderDetail({ wo, onClose, onUpdated, currentUser }) {
  const [suivis, setSuivis]         = useState([]);
  const [note, setN
